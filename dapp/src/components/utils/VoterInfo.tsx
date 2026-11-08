import { truncateMiddle } from "utils/utils";

interface VoterInfoProps {
  address: string;
  action?: React.ReactNode;
}

const VoterInfo: React.FC<VoterInfoProps> = ({ address, action }) => {
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-sunken">
      <p className="font-mono text-ui text-ink break-all">
        {truncateMiddle(address, 24)}
      </p>
      {action}
    </div>
  );
};

export default VoterInfo;
