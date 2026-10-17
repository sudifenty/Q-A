export type SSTClass = 'P3' | 'P4' | 'P5' | 'P6' | 'P7';

export const SST_CLASS_ORDER: SSTClass[] = ['P3', 'P4', 'P5', 'P6', 'P7'];

export const SST_CLASS_COUNTS: Record<SSTClass, number> = {
  P3: 180,
  P4: 360,
  P5: 660,
  P6: 540,
  P7: 300
};

export const SST_TOTAL_QUESTIONS = 2040;
export const SST_SEQUENCE_LABEL = 'P3 → P4 → P5 → P6 → P7';
