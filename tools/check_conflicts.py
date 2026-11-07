# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "stellar-sdk",
#     "pycryptodome",
# ]
# ///
"""
Check whether votes on one or more proposals were cast by conflicted addresses.
"""

from __future__ import annotations

import argparse
import re
import sys

from Crypto.Hash import keccak
from stellar_sdk import Network, scval
from stellar_sdk.contract import ContractClient

TESTNET_RPC = "https://soroban-testnet.stellar.org:443"
TESTNET_CONTRACT_ID = "CBXKUSLQPVF35FYURR5C42BPYA5UOVDXX2ELKIM2CAJMCI6HXG2BHGZA"
MAINNET_RPC = "https://rpc.lightsail.network/"
MAINNET_CONTRACT_ID = "CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI"


def parse_proposal_ids(value: str) -> list[int]:
    proposal_ids: list[int] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            raise argparse.ArgumentTypeError("proposal IDs cannot be empty")
        try:
            if "-" in part:
                start_text, end_text = part.split("-", 1)
                start, end = int(start_text), int(end_text)
                if start < 0 or end < start:
                    raise ValueError

                proposal_ids.extend(range(start, end + 1))
            else:
                proposal_id = int(part)
                if proposal_id < 0:
                    raise ValueError

                proposal_ids.append(proposal_id)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(
                f"invalid proposal ID or range: {part!r}"
            ) from exc

    return list(dict.fromkeys(proposal_ids))


def derive_project_key(project_name: str) -> bytes:
    name = project_name.strip().lower().encode("utf-8")
    digest = keccak.new(digest_bits=256)
    digest.update(name)
    return digest.digest()


def get_network_config(network: str) -> tuple[str, str, str]:
    if network == "testnet":
        return (
            TESTNET_RPC,
            Network.TESTNET_NETWORK_PASSPHRASE,
            TESTNET_CONTRACT_ID,
        )

    return (
        MAINNET_RPC,
        Network.PUBLIC_NETWORK_PASSPHRASE,
        MAINNET_CONTRACT_ID,
    )


def get_field(value, key: str, default=None):
    if isinstance(value, dict):
        return value.get(key, default)

    return getattr(value, key, default)


def get_proposal(client: ContractClient, project_key: bytes, proposal_id: int):
    invocation = client.invoke(
        "get_proposal",
        parameters=[
            scval.to_bytes(project_key),
            scval.to_uint32(proposal_id),
        ],
        signer=None,
        simulate=True,
    )
    invocation.simulate()
    return scval.to_native(invocation.result())


def get_conflicts(
    client: ContractClient,
    project_key: bytes,
    proposal_id: int,
) -> list:
    invocation = client.invoke(
        "get_conflict_of_interest",
        parameters=[
            scval.to_bytes(project_key),
            scval.to_uint32(proposal_id),
        ],
        signer=None,
        simulate=True,
    )
    invocation.simulate()
    return list(scval.to_native(invocation.result()))


def address_string(address) -> str | None:
    if address is None:
        return None

    if isinstance(address, dict):
        address = address.get("address", address.get("value"))

    if address is None:
        return None

    return str(address)


def vote_address(vote) -> str | None:
    if isinstance(vote, (list, tuple)) and len(vote) >= 2:
        vote = vote[1]
    elif isinstance(vote, dict):
        values = vote.get("values")
        if values:
            vote = values[0]
    else:
        values = getattr(vote, "values", None)
        if values:
            vote = values[0]

    return address_string(get_field(vote, "address"))


def is_missing_proposal_error(error: Exception) -> bool:
    return re.search(r"\bContract,\s*#?301\b", str(error)) is not None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check proposal votes against conflicts of interest."
    )
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument(
        "--network",
        choices=("testnet", "mainnet"),
        default="testnet",
        help="Network (default: testnet)",
    )
    parser.add_argument(
        "--proposal-ids",
        required=True,
        type=parse_proposal_ids,
        help="Proposal ID(s), e.g. 0, 0,3,5, or 0-5",
    )
    args = parser.parse_args()

    rpc_url, passphrase, contract_id = get_network_config(args.network)
    client = ContractClient(contract_id, rpc_url, passphrase)
    project_key = derive_project_key(args.project)
    found_conflicts = False

    for proposal_id in args.proposal_ids:
        try:
            proposal = get_proposal(client, project_key, proposal_id)
            conflicts = get_conflicts(client, project_key, proposal_id)
        except Exception as exc:  # noqa: BLE001 - any RPC failure is reported
            if is_missing_proposal_error(exc):
                print(
                    f"proposal {proposal_id} does not exist in project {args.project}",
                    file=sys.stderr,
                )
                return 1

            print(
                f"could not check proposal {proposal_id}: {exc}",
                file=sys.stderr,
            )
            return 1

        title = get_field(proposal, "title", "")
        title = str(title) if title is not None else ""
        conflict_addresses = {
            normalized
            for address in conflicts
            if (normalized := address_string(address)) is not None
        }
        vote_data = get_field(proposal, "vote_data")
        votes = get_field(vote_data, "votes", []) or []
        proposal_has_conflict = False

        for index, vote in enumerate(votes):
            voter = vote_address(vote)
            if voter in conflict_addresses:
                proposal_has_conflict = True
                found_conflicts = True
                print(
                    f"conflict detected for proposal {proposal_id} {title}: "
                    f"vote {index} was cast by conflicted address {voter}",
                    file=sys.stderr,
                )

        if not proposal_has_conflict:
            print(f"no conflicting votes detected for proposal {proposal_id} {title}")

    return 1 if found_conflicts else 0


if __name__ == "__main__":
    sys.exit(main())
