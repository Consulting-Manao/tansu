import { DatePicker } from "components/utils/DatePicker";
import { Button, StepBar, Title } from "components/ui";
import { toast } from "utils/utils";
import { endOfDay, type ProposalDraft } from "./useProposalDraft";

/** The proposal's third step: the day its vote ends. */
const ProposalScheduleStep = ({
  draft,
  onNext,
  onBack,
}: {
  draft: ProposalDraft;
  onNext: () => void;
  onBack: () => void;
}) => (
  <div className="flex flex-col gap-10 md:gap-14">
    <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-8">
      <img
        src="/images/clock.svg"
        alt=""
        className="w-20 h-auto mx-auto sm:mx-0 sm:w-24"
      />

      <div className="flex-grow flex flex-col justify-center gap-6 sm:gap-8 text-center sm:text-left">
        <StepBar step={3} totalSteps={4} />
        <Title
          title="Voting Duration"
          description="Enter the number of days for the voting period."
        />

        <div className="flex flex-col gap-4 sm:gap-6">
          <p className="leading-4 text-body font-semibold text-ink">
            Select End Day
          </p>

          <div className="flex flex-col gap-6">
            <DatePicker
              selectedDate={draft.selectedDate}
              onDateChange={(day) => draft.setSelectedDate(endOfDay(day))}
            />

            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 text-ui sm:text-body">
              <p className="leading-4 text-ink-muted">Minimum duration:</p>
              <p className="leading-4 font-semibold text-ink">1 day</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="flex flex-col-reverse sm:flex-row justify-end gap-4 sm:gap-6">
      <Button tone="secondary" onClick={onBack} className="w-full sm:w-auto">
        Back
      </Button>
      <Button
        onClick={() => {
          try {
            draft.checkSchedule();
            onNext();
          } catch (err: any) {
            toast.error("Submit proposal", err.message);
          }
        }}
        className="w-full sm:w-auto"
      >
        Next
      </Button>
    </div>
  </div>
);

export default ProposalScheduleStep;
