import { useState, type FC, type ReactNode } from "react";

import Modal from "components/utils/Modal";
import { toast } from "utils/utils";
import Button from "components/utils/Button";

import { MEMO_BYTES, sendXLM } from "service/TxService";
import { errorMessage } from "utils/contractErrors";

const AMOUNTS = ["10", "100", "1000"];

/** XLM with at most 7 decimals, from 1 XLM. */
const isAmount = (value: string) =>
  /^\d+(\.\d{1,7})?$/.test(value) && Number(value) >= 1;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/**
 * Support Tansu: an XLM donation to the account that builds and runs the
 * platform, with an optional message.
 */
const DonateModal: FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messageBytes = byteLength(message);
  const amountError = isAmount(amount)
    ? null
    : "Enter at least 1 XLM, with up to 7 decimals.";
  const messageError =
    messageBytes > MEMO_BYTES
      ? `A message holds ${MEMO_BYTES} bytes: shorten it.`
      : null;

  const open = () => {
    setAmount("10");
    setMessage("");
    setIsOpen(true);
  };

  const handleContribute = async () => {
    if (amountError || messageError) return;
    setIsLoading(true);
    try {
      await sendXLM(amount, message);
      toast.success("Thank you!", "Your donation to Tansu is on its way.");
      setIsOpen(false);
    } catch (error) {
      toast.error("Support Tansu", errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div onClick={open}>{children}</div>

      {isOpen && (
        <Modal onClose={() => setIsOpen(false)} closable={!isLoading}>
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-[18px]">
            <img
              src="/images/heart.svg"
              alt=""
              className="w-16 h-16 sm:w-auto sm:h-auto mx-auto sm:mx-0 mb-2 sm:mb-0"
            />
            <div className="flex-grow flex flex-col gap-4 sm:gap-6 w-full">
              <div className="flex flex-col gap-2 sm:gap-3">
                <h6 className="text-xl sm:text-2xl font-medium text-primary text-center sm:text-left">
                  Support Tansu
                </h6>
                <p className="text-sm sm:text-base text-secondary text-center sm:text-left">
                  Your donation goes to Tansu, which builds and runs this
                  platform for every project on it.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:gap-3">
                <label className="flex flex-col gap-2 sm:gap-3 text-sm sm:text-base font-[600] text-primary">
                  Amount
                  <span className="w-full flex-grow flex border border-[#978AA1] font-normal">
                    <input
                      className="flex-grow p-3 sm:p-[18px] outline-none text-sm sm:text-base"
                      inputMode="decimal"
                      placeholder="Enter the amount"
                      value={amount}
                      aria-invalid={!!amountError}
                      onChange={(e) => setAmount(e.target.value.trim())}
                    />
                    <span className="px-2 sm:px-[18px] flex items-center text-base sm:text-xl text-primary">
                      XLM
                    </span>
                  </span>
                </label>
                <div className="w-full grid grid-cols-3 text-sm sm:text-base">
                  {AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={amount === value}
                      className={`py-2 sm:py-[11px] flex justify-center items-center leading-5 text-base sm:text-xl border border-[#FFB21E] ${
                        amount === value
                          ? "bg-[#FFB21E] text-white"
                          : "text-primary"
                      }`}
                      onClick={() => setAmount(value)}
                    >
                      {value} XLM
                    </button>
                  ))}
                </div>
                <p
                  className={`text-xs sm:text-base ${amountError ? "text-red-500" : "text-tertiary"}`}
                >
                  {amountError ?? "Minimum amount: 1 XLM"}
                </p>
              </div>

              <label className="flex flex-col gap-2 text-sm sm:text-base font-[600] text-primary">
                Message (optional)
                <textarea
                  className="p-3 sm:p-[18px] w-full border border-[#978AA1] outline-none text-sm sm:text-base font-normal"
                  placeholder="Write your message here"
                  value={message}
                  aria-invalid={!!messageError}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                />
                <span
                  className={`text-xs font-normal ${messageError ? "text-red-500" : "text-tertiary"}`}
                >
                  {messageError ?? `${messageBytes}/${MEMO_BYTES} bytes`}
                </span>
              </label>

              <div className="flex justify-end w-full">
                <Button
                  className="w-full sm:w-[220px] h-[48px] sm:h-[56px]"
                  onClick={handleContribute}
                  isLoading={isLoading}
                  disabled={!!amountError || !!messageError}
                >
                  Donate
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default DonateModal;
