interface SpinnerProps {
  className?: string;
  color?: "white" | "primary";
}

const Spinner = ({ className = "", color = "white" }: SpinnerProps) => {
  const borderColor = color === "primary" ? "border-[#311255]" : "border-white";

  return (
    <div
      className={`w-4 h-4 border-2 ${borderColor} border-b-transparent rounded-full animate-spin ${className}`}
    />
  );
};

export default Spinner;
