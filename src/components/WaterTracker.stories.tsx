import type { Meta, StoryObj } from '@storybook/react';
import WaterTracker from './WaterTracker';

const meta: Meta<typeof WaterTracker> = {
  title: 'Components/WaterTracker',
  component: WaterTracker,
  argTypes: {
    onAdd: { action: 'add-water' },
  },
};

export default meta;
type Story = StoryObj<typeof WaterTracker>;

export const Empty: Story = {
  args: {
    waterMl: 0,
  },
};

export const Partial: Story = {
  args: {
    waterMl: 1000,
  },
};

export const GoalReached: Story = {
  args: {
    waterMl: 2500,
  },
};
