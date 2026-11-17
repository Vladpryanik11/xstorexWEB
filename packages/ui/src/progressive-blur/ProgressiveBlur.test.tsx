import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressiveBlur } from './ProgressiveBlur';

describe('ProgressiveBlur', () => {
  it('is a decorative stack of blur layers on the given side', () => {
    const { container } = render(<ProgressiveBlur side="end" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveAttribute('data-side', 'end');
    expect(root.children).toHaveLength(2);
  });
});
