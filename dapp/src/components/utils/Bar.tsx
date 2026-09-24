/** A horizontal bar, filled to `percent` of its track. */
export default function Bar({
  percent,
  className = "",
}: {
  percent: number;
  className?: string;
}) {
  return (
    <div
      className={`h-2 bg-gray-200 rounded-full overflow-hidden ${className}`}
    >
      <div
        className="h-full bg-blue-500 transition-all duration-300"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}
