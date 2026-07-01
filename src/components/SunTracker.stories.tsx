import type { Meta, StoryObj } from '@storybook/react';
import SunTracker from './SunTracker';

const meta: Meta<typeof SunTracker> = {
  title: 'Components/SunTracker',
  component: SunTracker,
  argTypes: {
    onLog: { action: 'log-sun' },
  },
};

export default meta;
type Story = StoryObj<typeof SunTracker>;

export const NoExposure: Story = {
  args: {
    sunMinutes: 0,
  },
};

export const Partial: Story = {
  args: {
    sunMinutes: 15,
  },
};

export const GoalReached: Story = {
  args: {
    sunMinutes: 30,
  },
};
