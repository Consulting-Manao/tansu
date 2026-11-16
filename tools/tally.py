# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "stellar-sdk",
#     "cryptography",
#     "pycryptodome",
#     "py_ecc",
# ]
# ///
"""
Check the votes of a round of proposals off chain, and execute them.

For each proposal, the script reads the ballots and the sums the contract keeps, and
redoes the contract's arithmetic locally, independently of the contract and the dApp:

- each anonymous ballot is opened with the project's key file and must be bound to its
  voter, project and proposal, choose exactly one option, and match its commitments on
  chain; a ballot that does not is named and left out of the tallies;
- the ballots, weighted, must add up to the sums on chain (one that expired or was
  removed shows here);
- the tallies and seeds of the valid ballots must open the sums on chain, as `execute`
  checks them; public votes are summed and compared with the tallies on chain;
- an executed proposal's status must be the outcome of its tallies.

Nothing is sent unless a signer is given: then each active proposal whose vote has
ended and whose checks all pass is executed with the Stellar CLI, one call after the
other. Executed proposals are not sent again, so a run can be repeated.

    # check only
    uv run tools/tally.py --project stellarpgq4 --network mainnet --proposal-ids 0-23 \\
        --key-file stellarpgq4.json

    # check, then execute what passes, signed by a CLI identity or a wallet
    uv run tools/tally.py ... --source tansu-maintainer
    uv run tools/tally.py ... --source G... --sign-with lab

Ballots are temporary entries, deleted 14 days after a proposal's earliest execution:
past that, a proposal can no longer be checked.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from base64 import b64decode
from datetime import UTC, datetime
from pathlib import Path

from Crypto.Hash import keccak
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from py_ecc.optimized_bls12_381 import (
    FQ,
    Z1,
    add,
    curve_order,
    is_inf,
    multiply,
    normalize,
)
from stellar_sdk import Durability, Network, SorobanServer, scval, xdr
from stellar_sdk.contract import ContractClient

NETWORKS = {
    "testnet": (
        "https://soroban-testnet.stellar.org:443",
        Network.TESTNET_NETWORK_PASSPHRASE,
    ),
    "mainnet": ("https://rpc.lightsail.network/", Network.PUBLIC_NETWORK_PASSPHRASE),
}

CHOICES = ("approve", "reject", "abstain")

# How the dApp encrypts each value of an anonymous ballot (RSA-OAEP, SHA-256).
OAEP = padding.OAEP(
    mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None
)


def read(client: ContractClient, function: str, *parameters):
    """A read-only call to the contract, as a native Python value."""
    invocation = client.invoke(function, parameters=list(parameters), simulate=True)
    return scval.to_native(invocation.result())


def point(data: bytes):
    """A G1 point from the contract's 96 bytes: x then y, or 0x40 for infinity."""
    if data[0] & 0x40:
        return Z1
    return (FQ(int.from_bytes(data[:48])), FQ(int.from_bytes(data[48:])), FQ.one())


def encode(p) -> bytes:
    """The contract's 96 bytes of a G1 point."""
    if is_inf(p):
        return bytes([0x40]) + bytes(95)
    x, y = normalize(p)
    return int(x).to_bytes(48) + int(y).to_bytes(48)


def commit(g, h, votes: list[int], seeds: list[int]) -> list[bytes]:
    """The commitments g·vote + h·seed, one per choice, as the contract stores them."""
    return [
        encode(add(multiply(g, v % curve_order), multiply(h, s % curve_order)))
        for v, s in zip(votes, seeds)
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check the votes of a round of proposals off chain, and execute them."
    )
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument(
        "--network",
        choices=tuple(NETWORKS),
        default="testnet",
        help="Network (default: testnet)",
    )
    parser.add_argument(
        "--proposal-ids", required=True, help="Proposal ids, e.g. 0-23 or 0,3,5-7"
    )
    parser.add_argument(
        "--key-file",
        help="The project's anonymous key file, as the dApp saves it",
    )
    parser.add_argument(
        "--source",
        help="Execute with this maintainer: a Stellar CLI identity, or an address"
        " signed with --sign-with. Without it, nothing is sent.",
    )
    parser.add_argument(
        "--sign-with",
        choices=("lab", "ledger"),
        help="Sign each call in Stellar Lab or on a Ledger",
    )
    args = parser.parse_args()

    rpc_url, passphrase = NETWORKS[args.network]
    contract_id = (
        (Path(__file__).parent.parent / "deployments" / f"tansu-{args.network}")
        .read_text()
        .strip()
    )
    client = ContractClient(contract_id, rpc_url, passphrase)
    server = SorobanServer(rpc_url)
    # The name as typed: the contract hashes it as is, and ballots are bound to it.
    digest = keccak.new(digest_bits=256)
    digest.update(args.project.encode())
    project_key = digest.digest()
    key = (
        serialization.load_der_private_key(
            b64decode(json.loads(Path(args.key_file).read_text())["privateKey"]),
            password=None,
        )
        if args.key_file
        else None
    )
    maintainer = (
        subprocess.run(
            ["stellar", "keys", "address", args.source],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if args.source
        else None
    )
    proposal_ids = [
        n
        for part in args.proposal_ids.split(",")
        for n in range(int(part.split("-")[0]), int(part.split("-")[-1]) + 1)
    ]
    passed, failed, executed, not_sent = [], [], [], []

    for proposal_id in proposal_ids:
        # --- Read the proposal with its ballots, and the sums the contract keeps.
        try:
            proposal = read(
                client,
                "get_proposal",
                scval.to_bytes(project_key),
                scval.to_uint32(proposal_id),
            )
        except Exception as error:  # noqa: BLE001 - a revoked id is reported, not fatal
            print(f"#{proposal_id}: cannot be read ({error})\n")
            failed.append(proposal_id)
            continue
        status = proposal["status"][0]
        ends = proposal["vote_data"]["voting_ends_at"]
        anonymous = not proposal["vote_data"]["public_voting"]
        ballots = [vote[1] for vote in proposal["vote_data"]["votes"]]
        print(
            f"#{proposal_id} {proposal['title']}\n"
            f"  {status}, {'anonymous' if anonymous else 'public'} vote"
            f" {'ended' if ends <= time.time() else 'runs until'}"
            f" {datetime.fromtimestamp(ends, UTC):%Y-%m-%d %H:%M UTC}"
        )
        if not ballots:
            print("  no ballot left on chain: nothing to check\n")
            failed.append(proposal_id)
            continue
        # ProjectKey::ProposalTallies(project_key, id) in contracts/tansu/src/types.rs:
        # this read follows the contract's storage layout.
        entry = server.get_contract_data(
            contract_id,
            scval.to_vec(
                [
                    scval.to_symbol("ProposalTallies"),
                    scval.to_bytes(project_key),
                    scval.to_uint32(proposal_id),
                ]
            ),
            Durability.PERSISTENT,
        )
        on_chain = scval.to_native(
            xdr.LedgerEntryData.from_xdr(entry.xdr).contract_data.val
        )[1]

        # --- Add up the ballots; anonymous ones are opened and checked first.
        tallies, seeds = [0, 0, 0], [0, 0, 0]
        checks = {}
        if anonymous:
            config = read(
                client, "get_anonymous_voting_config", scval.to_bytes(project_key)
            )
            g = point(config["vote_generator_point"])
            h = point(config["seed_generator_point"])
            weighted = [Z1, Z1, Z1]
            invalid = 0
            for ballot in ballots:
                voter = ballot["address"].address
                for i, commitment in enumerate(ballot["commitments"]):
                    weighted[i] = add(
                        weighted[i], multiply(point(commitment), ballot["weight"])
                    )
                # Each value is "voter:project:id:value", encrypted; the proposer's
                # own abstain ballot is stored in the clear.
                prefix = f"{voter}:{args.project}:{proposal_id}:"
                try:
                    values = []
                    for text in ballot["encrypted_votes"] + ballot["encrypted_seeds"]:
                        if not text.isdigit():
                            text = key.decrypt(b64decode(text), OAEP).decode()
                            if not text.startswith(prefix):
                                raise ValueError(
                                    "it was encrypted for another voter or proposal"
                                )
                            text = text.removeprefix(prefix)
                        values.append(int(text))
                except ValueError as error:
                    reason = f"it cannot be read with this key: {error}"
                else:
                    split = len(ballot["encrypted_votes"])
                    votes, ballot_seeds = values[:split], values[split:]
                    if len(ballot_seeds) != 3 or sorted(votes) != [0, 0, 1]:
                        reason = "it does not choose exactly one option"
                    elif commit(g, h, votes, ballot_seeds) != ballot["commitments"]:
                        reason = "its values do not match its commitments on chain"
                    else:
                        for i in range(3):
                            tallies[i] += votes[i] * ballot["weight"]
                            seeds[i] = (
                                seeds[i] + ballot_seeds[i] * ballot["weight"]
                            ) % curve_order
                        continue
                print(f"  cannot count {voter}: {reason}")
                invalid += 1
            print(f"  {len(ballots)} ballots, {invalid} cannot count")
            checks["the ballots add up to the sums on chain"] = [
                encode(p) for p in weighted
            ] == on_chain
            checks["the tallies open the sums on chain"] = (
                commit(g, h, tallies, seeds) == on_chain
            )
        else:
            for ballot in ballots:
                tallies[CHOICES.index(ballot["vote_choice"][0].lower())] += ballot[
                    "weight"
                ]
            checks["the ballots add up to the tallies on chain"] = tallies == on_chain

        # --- Compare with what the contract holds.
        approve, reject, abstain = tallies
        outcome = (
            "Approved"
            if approve > reject + abstain
            else "Rejected"
            if reject > approve + abstain
            else "Cancelled"
        )
        print("  " + ", ".join(f"{c} {t}" for c, t in zip(CHOICES, tallies)))
        if status in ("Approved", "Rejected", "Cancelled"):
            checks[f"the status is the outcome of the tallies ({outcome})"] = (
                status == outcome
            )
        for check, ok in checks.items():
            print(f"  {'ok  ' if ok else 'FAIL'} {check}")
        (passed if all(checks.values()) else failed).append(proposal_id)

        # --- Execute, with a signer, once the vote ended and everything matches.
        if not maintainer or status != "Active":
            print()
            continue
        if not all(checks.values()) or ends > time.time():
            reason = "a check failed" if not all(checks.values()) else "the vote runs"
            print(f"  not executed: {reason}\n")
            not_sent.append(proposal_id)
            continue
        print(f"  executing -> {outcome}", flush=True)
        call = [
            "stellar",
            "contract",
            "invoke",
            "--network",
            args.network,
            "--id",
            contract_id,
            "--source",
            args.source,
            *([f"--sign-with-{args.sign_with}"] if args.sign_with else []),
            "--",
            "execute",
            "--maintainer",
            maintainer,
            "--project_key",
            project_key.hex(),
            "--proposal_id",
            str(proposal_id),
        ]
        if anonymous:
            call += [
                "--tallies",
                json.dumps([str(t) for t in tallies]),
                "--seeds",
                json.dumps([str(s) for s in seeds]),
            ]
        sent = subprocess.run(call, check=False)
        (executed if sent.returncode == 0 else not_sent).append(proposal_id)
        print()

    print(f"checks pass: {passed}\nchecks fail: {failed}")
    if maintainer:
        print(f"executed: {executed}\nnot executed: {not_sent}")
    sys.exit(1 if failed or not_sent else 0)


if __name__ == "__main__":
    main()
