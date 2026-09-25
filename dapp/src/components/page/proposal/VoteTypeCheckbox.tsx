import type { FC } from "react";
import { VoteType } from "types/proposal";
import type { AnyObject, Size } from "types/types";

interface Props {
  size?: Size;
  voteType: VoteType | null;
  currentVoteType?: VoteType | null;
}

const sizeMap: AnyObject = {
  sm: "24",
  md: "72",
};

const VoteTypeCheckbox: FC<Props> = ({
  size = "md",
  voteType,
  currentVoteType,
}) => {
  const width = `${sizeMap[size]}px`,
    height = `${sizeMap[size]}px`;
  const renderIcon = () => {
    if (voteType == currentVoteType) {
      if (voteType == VoteType.APPROVE) {
        return (
          <img
            alt=""
            src="/icons/check-approve.svg"
            style={{ width, height }}
          />
        );
      }

      if (voteType == VoteType.CANCEL) {
        return (
          <img alt="" src="/icons/check-cancel.svg" style={{ width, height }} />
        );
      }

      if (voteType == VoteType.REJECT) {
        return (
          <img alt="" src="/icons/check-reject.svg" style={{ width, height }} />
        );
      }
    }

    return (
      <img alt="" src="/icons/check-blank.svg" style={{ width, height }} />
    );
  };

  // A picture of the choice: the control around it is what is clicked.
  return <span className="shrink-0">{renderIcon()}</span>;
};

export default VoteTypeCheckbox;
