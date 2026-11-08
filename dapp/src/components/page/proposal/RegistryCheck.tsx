import { useEffect, useState } from "react";
import { getContractByName } from "@service/StellarRegistryService";

/**
 * The winning call is fixed on chain. When its contract was picked by a
 * Stellar Registry name, the name is looked up again: it may point to
 * another contract now, which the maintainer should know before executing.
 * It warns; it never blocks the call that was voted.
 */
const RegistryCheck = ({
  name,
  callAddress,
}: {
  name: string;
  callAddress: string;
}) => {
  const [now, setNow] = useState<{ address: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setNow(null);
    setFailed(false);
    let ignore = false;
    getContractByName(name)
      .then((contract) => {
        if (!ignore) setNow({ address: contract?.contractId ?? null });
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [name, callAddress]);

  return (
    <div className="flex flex-col gap-2 text-ui break-all">
      {now?.address === callAddress && (
        <p className="text-ink-muted">
          Stellar Registry: <code>{name}</code> still points to the contract
          this proposal calls.
        </p>
      )}
      {now && now.address === null && (
        <p className="text-danger" role="alert">
          <code>{name}</code> is no longer registered in the Stellar Registry.
          This proposal still calls <code>{callAddress}</code>.
        </p>
      )}
      {now?.address && now.address !== callAddress && (
        <p className="text-danger" role="alert">
          Stellar Registry: <code>{name}</code> now points to{" "}
          <code>{now.address}</code>. This proposal calls{" "}
          <code>{callAddress}</code>, the contract the name pointed to when it
          was proposed.
        </p>
      )}
      {failed && (
        <p className="text-ink-muted">
          The Stellar Registry could not be reached to check <code>{name}</code>
          .
        </p>
      )}
    </div>
  );
};

export default RegistryCheck;
