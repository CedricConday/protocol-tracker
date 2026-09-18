import type { Meta, StoryObj } from '@storybook/react';
import DurationInput from './DurationInput';

/**
 * Vitest runs node-only with no React Native transform, so this control cannot
 * have a unit test. Storybook is the only place its states can be looked at —
 * which is the point of the three below: a preset, a value no preset can
 * express, and the zero case.
 */
const meta: Meta<typeof DurationInput> = {
  title: 'Components/DurationInput',
  component: DurationInput,
  argTypes: {
    onChange: { action: 'changed' },
  },
};

export default meta;
type Story = StoryObj<typeof DurationInput>;

export const FourHoursAfterTheLastOne: Story = {
  args: { value: 240, label: 'How long after Vitamin K2?' },
};

export const AnAwkwardGap: Story = {
  args: { value: 47, label: 'How long after Vitamin D3?' },
};

export const TakenTogether: Story = {
  args: { value: 0, label: 'How long after Vitamin D3?' },
};
