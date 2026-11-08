import type { FC, MouseEventHandler, ReactNode } from "react";
import type { Size } from "types/types";
import {
  Button as KitButton,
  type ButtonSize,
  type ButtonTone,
} from "components/ui";

interface Props {
  id?: string;
  type?: "primary" | "secondary" | "tertiary" | "quaternary";
  order?: "primary" | "secondary";
  size?: Size;
  className?: string;
  children?: ReactNode;
  icon?: string;
  isLoading?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  title?: string;
  disabled?: boolean;
  [key: string]: any; // allow data-*, aria-* passthrough
}

const tones: Record<NonNullable<Props["type"]>, ButtonTone> = {
  primary: "primary",
  secondary: "secondary",
  tertiary: "secondary",
  quaternary: "ghost",
};

const sizes: Record<Size, ButtonSize> = {
  "2xs": "sm",
  xs: "sm",
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "lg",
  "2xl": "lg",
};

/**
 * The older button API on the kit's Button (components/ui): `type` is the
 * tone here, and `icon` an image placed before or after the label.
 */
const Button: FC<Props> = ({
  type = "primary",
  order = "primary",
  size = "md",
  icon,
  isLoading,
  children,
  ...rest
}) => {
  const image = icon && <img src={icon} alt="" className="size-5 shrink-0" />;
  return (
    <KitButton
      tone={tones[type]}
      size={sizes[size]}
      loading={isLoading}
      {...rest}
    >
      {order === "primary" && !isLoading && image}
      {children}
      {order === "secondary" && image}
    </KitButton>
  );
};

export default Button;
