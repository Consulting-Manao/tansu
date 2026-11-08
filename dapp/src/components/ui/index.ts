/**
 * The UI kit: every piece of the interface, on the design-system tokens of
 * styles/global.css. Pieces take data as props and import nothing from
 * service/, the Stellar SDK, the wallets kit or the network: the design
 * canvas mounts the same pieces (with React 18, so no React 19-only API).
 * They inherit the font: a page sets `font-ui text-body text-ink` once on
 * its root (the kit page now, <body> once the shell moves).
 */
export { Badge, type BadgeTone } from "./Badge";
export {
  Button,
  ButtonLink,
  buttonClass,
  type ButtonSize,
  type ButtonTone,
} from "./Button";
export { Card, CardHeader } from "./Card";
export { Checkbox } from "./Checkbox";
export { IconButton } from "./IconButton";
export { Input } from "./Input";
export { Notice, type NoticeTone } from "./Notice";
export { RadioGroup, type RadioOption } from "./RadioGroup";
export { SegmentedControl, type Segment } from "./SegmentedControl";
export { Select } from "./Select";
export { Spinner } from "./Spinner";
export { Tabs, type TabItem } from "./Tabs";
export { Textarea } from "./Textarea";
