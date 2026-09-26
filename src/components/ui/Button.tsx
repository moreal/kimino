import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'primary-button',
  secondary: 'secondary-button',
  danger: 'danger-button',
  ghost: 'text-button',
  icon: 'icon-button',
};

export default function Button(props: ButtonProps) {
  return (
    <button
      {...omit(props, 'variant', 'class')}
      type={props.type ?? 'button'}
      class={`${variantClasses[props.variant ?? 'secondary']}${props.class ? ` ${props.class}` : ''}`}
    />
  );
}
