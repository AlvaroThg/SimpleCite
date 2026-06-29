import * as React from 'react';
import { StatusBadge } from 'web';

export const Estados = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
    <StatusBadge status="TENTATIVE" />
    <StatusBadge status="PENDING_PAYMENT" />
    <StatusBadge status="CONFIRMED" />
    <StatusBadge status="COMPLETED" />
    <StatusBadge status="CANCELLED" />
    <StatusBadge status="NO_SHOW" />
  </div>
);
