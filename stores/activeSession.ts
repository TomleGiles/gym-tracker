import { create } from 'zustand';

import { cancelRestEnd, scheduleRestEnd } from '../lib/notifications';

export type RestTimer = {
  /** Epoch ms de fin. On stocke une échéance, pas un compte à rebours : le
   *  chrono reste juste même si le JS a été gelé en arrière-plan. */
  endsAt: number;
  totalSeconds: number;
  exerciseLabel: string;
  notificationId: string | null;
};

export type PrFlash = { exerciseId: string; setId: string; e1rm: number; at: number };

type State = {
  /** Exercice déplié dans l'écran de séance — un seul à la fois. */
  expandedSlotId: string | null;
  rest: RestTimer | null;
  prFlash: PrFlash | null;

  expand: (slotId: string | null) => void;
  startRest: (seconds: number, exerciseLabel: string) => void;
  extendRest: (deltaSeconds: number) => void;
  stopRest: () => void;
  flashPr: (flash: PrFlash) => void;
  clearPr: () => void;
  reset: () => void;
};

export const useActiveSession = create<State>((set, get) => ({
  expandedSlotId: null,
  rest: null,
  prFlash: null,

  expand: (slotId) => set({ expandedSlotId: slotId }),

  startRest: (seconds, exerciseLabel) => {
    const previous = get().rest;
    if (previous) void cancelRestEnd(previous.notificationId);

    const timer: RestTimer = {
      endsAt: Date.now() + seconds * 1000,
      totalSeconds: seconds,
      exerciseLabel,
      notificationId: null,
    };
    set({ rest: timer });

    // La notification est programmée en tâche de fond : le chrono à l'écran
    // démarre immédiatement, sans attendre la réponse du système.
    void scheduleRestEnd(seconds, exerciseLabel).then((id) => {
      const current = get().rest;
      if (current && current.endsAt === timer.endsAt) {
        set({ rest: { ...current, notificationId: id } });
      } else {
        void cancelRestEnd(id);
      }
    });
  },

  extendRest: (deltaSeconds) => {
    const current = get().rest;
    if (!current) return;
    const remaining = Math.max(0, (current.endsAt - Date.now()) / 1000);
    get().startRest(Math.max(5, Math.round(remaining + deltaSeconds)), current.exerciseLabel);
  },

  stopRest: () => {
    const current = get().rest;
    if (current) void cancelRestEnd(current.notificationId);
    set({ rest: null });
  },

  flashPr: (flash) => set({ prFlash: flash }),
  clearPr: () => set({ prFlash: null }),

  reset: () => {
    const current = get().rest;
    if (current) void cancelRestEnd(current.notificationId);
    set({ expandedSlotId: null, rest: null, prFlash: null });
  },
}));
