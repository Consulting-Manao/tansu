"""Print the project keys to give to `migrate`, from the storage of
the contract named in deployments/tansu-mainnet, as listed by Stellar Expert."""

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

LIMIT = 200
contract = Path("deployments/tansu-mainnet").read_text().strip()
url = (
    f"https://api.stellar.expert/explorer/public/contract-data/{contract}?limit={LIMIT}"
)
request = urllib.request.Request(url, headers={"User-Agent": "tansu-migration"})
entries = json.load(urllib.request.urlopen(request))["_embedded"]["records"]


def decode(xdr):
    out = subprocess.run(
        [
            "stellar",
            "xdr",
            "decode",
            "--type",
            "ScVal",
            "--input",
            "single-base64",
            "--output",
            "json",
        ],
        input=xdr,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def plain(value):
    if "vec" in value:
        return [plain(item) for item in value["vec"]]
    if "map" in value:
        return {plain(e["key"]): plain(e["val"]) for e in value["map"]}
    return next(iter(value.values()))


projects = set()
for entry in entries:
    if entry["durability"] == "instance":
        for item in decode(entry["value"])["contract_instance"]["storage"]:
            key = plain(item["key"])
            if key[0] == "AnonymousVoteConfig":
                projects.add(key[1])
        continue
    key = plain(decode(entry["key"]))
    if key[0] == "DaoTotalProposals":
        projects.add(key[1])

print(f"{len(entries)} entries, {len(projects)} projects", file=sys.stderr)
print("project_keys=" + json.dumps(sorted(projects), separators=(",", ":")))
