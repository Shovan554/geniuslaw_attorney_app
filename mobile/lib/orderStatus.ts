import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import type { AppColors } from '../constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export type OrderStatusMeta = {
  label: string;
  icon: IoniconsName;
  fg: string;
  bg: string;
};

export function formatOrderTitle(label: string | null | undefined): string {
  return (label ?? '').replace(/\bLean\b/g, 'Lien');
}

export function orderStatusMeta(
  status: string | null | undefined,
  colors: AppColors,
): OrderStatusMeta {
  const normalized = (status ?? '').toLowerCase().trim();
  switch (normalized) {
    case 'open':
      return {
        label: 'Open',
        icon: 'ellipse-outline',
        fg: colors.accent,
        bg: colors.accentTint,
      };
    case 'in_progress':
      return {
        label: 'In Progress',
        icon: 'sync-outline',
        fg: colors.gold,
        bg: 'rgba(184,146,74,0.14)',
      };
    case 'closed':
    case 'done':
    case 'completed':
      return {
        label: 'Closed',
        icon: 'checkmark-done-outline',
        fg: colors.success,
        bg: 'rgba(76,175,125,0.14)',
      };
    case 'cancelled':
    case 'canceled':
    case 'declined':
      return {
        label: normalized === 'declined' ? 'Declined' : 'Cancelled',
        icon: 'close-circle-outline',
        fg: colors.danger,
        bg: 'rgba(224,82,82,0.12)',
      };
    case 'on_hold':
      return {
        label: 'On Hold',
        icon: 'pause-circle-outline',
        fg: colors.gold,
        bg: 'rgba(184,146,74,0.14)',
      };
    case 'paid':
      return {
        label: 'Paid',
        icon: 'cash-outline',
        fg: colors.success,
        bg: 'rgba(76,175,125,0.14)',
      };
    case 'new':
      return {
        label: 'New',
        icon: 'sparkles-outline',
        fg: colors.accent,
        bg: colors.accentTint,
      };
    default:
      return {
        label: normalized ? normalized.replace(/_/g, ' ') : 'Pending',
        icon: 'hourglass-outline',
        fg: colors.textMuted,
        bg: 'rgba(138,140,152,0.14)',
      };
  }
}

export type CaseStatusKey = 'open' | 'in_progress' | 'closed';

export function caseStatusMeta(
  status: CaseStatusKey,
  colors: AppColors,
): OrderStatusMeta {
  switch (status) {
    case 'closed':
      return {
        label: 'Closed',
        icon: 'checkmark-done-outline',
        fg: colors.textMuted,
        bg: 'rgba(138,140,152,0.14)',
      };
    case 'in_progress':
      return {
        label: 'In Progress',
        icon: 'sync-outline',
        fg: colors.gold,
        bg: 'rgba(184,146,74,0.14)',
      };
    case 'open':
    default:
      return {
        label: 'Open',
        icon: 'ellipse-outline',
        fg: colors.accent,
        bg: colors.accentTint,
      };
  }
}
