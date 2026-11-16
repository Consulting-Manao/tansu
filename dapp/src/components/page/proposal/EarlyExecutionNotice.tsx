import { Notice } from "components/ui";
import type { EarlyExecution } from "types/proposal";

/** Why Execute shows before the proposal's normal time, and what it ends. */
const EarlyExecutionNotice = ({ early }: { early: EarlyExecution }) => (
  <Notice tone="warning">
    {early.voted} of {early.total} maintainers have voted, so this proposal can
    be executed before {new Date(early.executableAt).toLocaleString()}.
    {early.running &&
      " Executing ends the vote for everyone who has not voted yet."}
  </Notice>
);

export default EarlyExecutionNotice;
