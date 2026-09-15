"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore
} from "react";
import { TransferLifecycleRecorder } from "./transfer-lifecycle-recorder";
import { TransfersController } from "./transfers-controller";
import {
  DevelopmentTransfersRepository,
  PersistentTransfersRepository,
  type TransfersRepository
} from "./transfers-repository";

export type TransfersRepositoryMode = "development" | "persistent";

type TransfersContextValue = {
  controller: TransfersController;
  mode: TransfersRepositoryMode;
  recorder: TransferLifecycleRecorder;
  snapshot: ReturnType<TransfersController["getSnapshot"]>;
};

const TransfersContext = createContext<TransfersContextValue | null>(null);

declare global {
  interface Window {
    __flicksendP7?: {
      resetDevelopmentStore: () => Promise<void>;
      snapshot: () => ReturnType<TransfersController["getSnapshot"]>;
    };
  }
}

export function TransfersProvider({
  children,
  currentPersonId,
  mode = "development"
}: {
  children: ReactNode;
  currentPersonId: string;
  mode?: TransfersRepositoryMode;
}) {
  const controllerRef = useRef<TransfersController | null>(null);
  const repositoryRef = useRef<TransfersRepository | null>(null);
  if (!repositoryRef.current)
    repositoryRef.current =
      mode === "persistent"
        ? new PersistentTransfersRepository()
        : new DevelopmentTransfersRepository();
  if (!controllerRef.current || controllerRef.current.currentPersonId !== currentPersonId)
    controllerRef.current = new TransfersController(currentPersonId, repositoryRef.current);
  const controller = controllerRef.current;
  const recorderRef = useRef<TransferLifecycleRecorder | null>(null);
  if (!recorderRef.current) recorderRef.current = new TransferLifecycleRecorder(controller);
  const recorder = recorderRef.current;
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot()
  );

  useEffect(() => {
    void controller.load();
  }, [controller]);

  useEffect(() => {
    if (!snapshot.records.some((record) => record.active !== null)) return;
    const interval = window.setInterval(() => void controller.load(), 1_000);
    return () => window.clearInterval(interval);
  }, [controller, snapshot.records]);

  useEffect(() => {
    if (mode !== "development" || process.env.NODE_ENV === "production") return;
    window.__flicksendP7 = {
      resetDevelopmentStore: () => controller.resetDevelopmentStore(),
      snapshot: () => controller.getSnapshot()
    };
    return () => {
      delete window.__flicksendP7;
    };
  }, [controller, mode]);

  return (
    <TransfersContext.Provider value={{ controller, mode, recorder, snapshot }}>
      {children}
    </TransfersContext.Provider>
  );
}

export function useTransfers(): TransfersContextValue {
  const transfers = useContext(TransfersContext);
  if (!transfers) throw new Error("TransfersProvider is required for Transfers state.");
  return transfers;
}
