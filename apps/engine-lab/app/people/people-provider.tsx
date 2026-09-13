"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore
} from "react";
import { PeopleController } from "./people-controller";
import {
  DevelopmentPeopleRepository,
  PersistentPeopleRepository,
  type PeopleRepository
} from "./people-repository";
import {
  defaultDevelopmentPersonId,
  developmentPersonById,
  type PersonIdentity
} from "./people-types";

export type PeopleRepositoryMode = "development" | "persistent";

type PeopleContextValue = {
  controller: PeopleController;
  mode: PeopleRepositoryMode;
  snapshot: ReturnType<PeopleController["getSnapshot"]>;
};

const PeopleContext = createContext<PeopleContextValue | null>(null);

declare global {
  interface Window {
    __flicksendP6?: {
      createInvite: () => Promise<void>;
      redeemInvite: (code: string) => Promise<void>;
      reload: () => Promise<void>;
      resetDevelopmentStore: () => Promise<void>;
      snapshot: () => ReturnType<PeopleController["getSnapshot"]>;
    };
  }
}

export function PeopleProvider({
  children,
  currentPerson = developmentPersonById(defaultDevelopmentPersonId),
  mode = "development"
}: {
  children: ReactNode;
  currentPerson?: PersonIdentity;
  mode?: PeopleRepositoryMode;
}) {
  const controllerRef = useRef<PeopleController | null>(null);
  const repositoryRef = useRef<PeopleRepository | null>(null);
  if (!repositoryRef.current)
    repositoryRef.current =
      mode === "persistent" ? new PersistentPeopleRepository() : new DevelopmentPeopleRepository();
  if (!controllerRef.current || controllerRef.current.currentPersonId !== currentPerson.id)
    controllerRef.current = new PeopleController(currentPerson, repositoryRef.current);
  const controller = controllerRef.current;
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot()
  );

  useEffect(() => {
    void controller.load();
  }, [controller]);

  useEffect(() => {
    if (mode !== "development" || process.env.NODE_ENV === "production") return;
    window.__flicksendP6 = {
      createInvite: () => controller.createInvite(),
      redeemInvite: (code) => controller.redeemInvite(code),
      reload: () => controller.load(),
      resetDevelopmentStore: () => controller.resetDevelopmentStore(),
      snapshot: () => controller.getSnapshot()
    };
    return () => {
      delete window.__flicksendP6;
    };
  }, [controller, mode]);

  return (
    <PeopleContext.Provider value={{ controller, mode, snapshot }}>{children}</PeopleContext.Provider>
  );
}

export function usePeople(): PeopleContextValue {
  const people = useContext(PeopleContext);
  if (!people) throw new Error("PeopleProvider is required for People state.");
  return people;
}
