import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';
import './Field.css';

export function TextInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...omit(props, 'class')} class={`ui-input${props.class ? ` ${props.class}` : ''}`} />
  );
}

export function TextArea(props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...omit(props, 'class')}
      class={`ui-textarea${props.class ? ` ${props.class}` : ''}`}
    />
  );
}
