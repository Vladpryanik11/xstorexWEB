import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IPhoneFrame } from './IPhoneFrame';

describe('IPhoneFrame', () => {
  it('shows its content on the screen under a decorative SVG bezel', () => {
    const { container } = render(
      <IPhoneFrame>
        <img src="/s.png" alt="Скриншот 1" />
      </IPhoneFrame>,
    );
    const frame = container.querySelector('[data-iphone-frame]');
    expect(frame).not.toBeNull();
    expect(frame).toContainElement(screen.getByRole('img', { name: 'Скриншот 1' }));
    const svg = frame?.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('image')).toBeNull();
  });

  it('leaves the screen opening uncovered: every filled shape of the bezel is a ring', () => {
    const { container } = render(
      <IPhoneFrame>
        <img src="/s.png" alt="" />
      </IPhoneFrame>,
    );
    // A solid rounded rect over the whole frame would hide the screenshot (bug of 2026-11-17).
    const shapes = [...container.querySelectorAll('svg rect, svg path')];
    const solid = shapes.filter(
      (el) => el.tagName === 'rect' && Number(el.getAttribute('height')) > 100,
    );
    expect(solid).toEqual([]);
    expect(shapes.filter((el) => el.tagName === 'path')).toHaveLength(2);
    for (const path of shapes.filter((el) => el.tagName === 'path')) {
      expect(path).toHaveAttribute('fill-rule', 'evenodd');
    }
  });
});
