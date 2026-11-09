import { useQuery } from "@tanstack/react-query";
import { VETO_REASON_FILE, vetoQuery } from "@service/ProposalService";
import { queryClient } from "@service/queryClient";
import { Notice } from "components/ui";
import { getIpfsUrl, ipfsQuery } from "utils/ipfsFunctions";
import { memberUrl } from "utils/urls";
import { truncateMiddle } from "utils/utils";

/**
 * Who vetoed a proposal and why: its maintainer, from the veto the ledger
 * keeps, and the reason, a file on IPFS that is uploaded once the veto
 * landed, so for a few seconds the gateway may not have it yet.
 */
const VetoNotice = ({ name, id }: { name: string; id: number }) => {
  const veto = useQuery(vetoQuery(name, id), queryClient).data;
  const reason = useQuery(
    {
      ...ipfsQuery(veto?.reason ?? "", `/${VETO_REASON_FILE}`),
      enabled: !!veto,
      // A reason the gateway did not have is asked for again.
      staleTime: (query) => (query.state.data === null ? 0 : Infinity),
    },
    queryClient,
  );
  if (!veto) return null;
  const available = !!reason.data;
  return (
    <Notice tone="danger" className="max-w-220">
      <p>
        Vetoed by{" "}
        <a
          href={memberUrl(veto.maintainer)}
          className="font-mono text-link underline-offset-2 hover:underline"
        >
          {truncateMiddle(veto.maintainer, 16)}
        </a>
        . This proposal was rejected whatever the votes were, and none of its
        outcomes ran.{" "}
        {available ? (
          <a
            href={getIpfsUrl(veto.reason, `/${VETO_REASON_FILE}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-link underline"
          >
            Read the reason
          </a>
        ) : reason.isPending ? null : (
          "The reason is not available yet."
        )}
      </p>
    </Notice>
  );
};

export default VetoNotice;
