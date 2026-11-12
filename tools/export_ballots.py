# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "stellar-sdk",
#     "pycryptodome",
# ]
# ///
"""
Save every proposal of a project with its ballots, one JSON line per proposal.

Ballots are temporary entries: the network deletes them 14 days after the earliest
execution of their proposal, and `get_proposal` then returns the proposal without them.
Run this once a round is executed, and keep the file:

    uv run tools/export_ballots.py --project stellarpgq4 --network mainnet > stellarpgq4.jsonl

Each line holds the proposal as `get_proposal` returns it, readable (`proposal`) and as
the XDR of that value (`xdr`), which loses nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from Crypto.Hash import keccak
from stellar_sdk import Address, Network, scval
from stellar_sdk.contract import ContractClient

NETWORKS = {
    "testnet": (
        "https://soroban-testnet.stellar.org:443",
        Network.TESTNET_NETWORK_PASSPHRASE,
    ),
    "mainnet": ("https://rpc.lightsail.network/", Network.PUBLIC_NETWORK_PASSPHRASE),
}


def read(client: ContractClient, function: str, project_key: bytes, number: int):
    invocation = client.invoke(
        function,
        parameters=[scval.to_bytes(project_key), scval.to_uint32(number)],
        signer=None,
        simulate=True,
    )
    invocation.simulate()
    return invocation.result()


def plain(value):
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, Address):
        return value.address
    return str(value)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Save the proposals of a project with their ballots, as JSON lines."
    )
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument(
        "--network",
        choices=tuple(NETWORKS),
        default="testnet",
        help="Network (default: testnet)",
    )
    args = parser.parse_args()

    rpc_url, passphrase = NETWORKS[args.network]
    contract_id = (
        (Path(__file__).parent.parent / "deployments" / f"tansu-{args.network}")
        .read_text()
        .strip()
    )
    client = ContractClient(contract_id, rpc_url, passphrase)
    digest = keccak.new(digest_bits=256)
    digest.update(args.project.strip().lower().encode())
    project_key = digest.digest()

    proposals = ballots = page = 0
    while listed := scval.to_native(read(client, "get_dao", project_key, page))[
        "proposals"
    ]:
        for entry in listed:
            value = read(client, "get_proposal", project_key, entry["id"])
            proposal = scval.to_native(value)
            print(
                json.dumps(
                    {
                        "project": args.project,
                        "project_key": project_key.hex(),
                        "proposal": proposal,
                        "xdr": value.to_xdr(),
                    },
                    default=plain,
                )
            )
            proposals += 1
            ballots += len(proposal["vote_data"]["votes"])
        page += 1
    print(f"{proposals} proposals, {ballots} ballots", file=sys.stderr)


if __name__ == "__main__":
    main()
