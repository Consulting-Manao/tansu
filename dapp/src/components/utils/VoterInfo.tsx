import { truncateMiddle } from "utils/utils";

interface VoterInfoProps {
  address: string;
  action?: React.ReactNode;
}

const VoterInfo: React.FC<VoterInfoProps> = ({ address, action }) => {
  return (
    <div className="flex items-center justify-between gap-3 p-[12px] bg-sunken">
      <p className="font-mono text-sm text-ink break-all">
        {truncateMiddle(address, 24)}
      </p>
      {action}
    </div>
  );
};

export default VoterInfo;
