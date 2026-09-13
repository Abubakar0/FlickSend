import type { ProductErrorViewModel } from "@flicksend/ui";
import {
  type PeopleSnapshot,
  type PersonIdentity,
  type PersonRelationship
} from "./people-types";
import type { PeopleRepositoryErrorCode } from "./people-repository";

export type PeopleProductError = ProductErrorViewModel & { code: string };

export type PeopleWorkflowSnapshot = PeopleSnapshot & {
  error: PeopleProductError | null;
  inviteCode: string | null;
  isLoading: boolean;
  operation: string | null;
  operationRevision: number;
};

export type PeopleWorkflowEvent =
  | { type: "LOAD_STARTED"; revision: number }
  | { type: "OPERATION_STARTED"; operation: string; revision: number }
  | {
      type: "SNAPSHOT_RESOLVED";
      inviteCode: string | null;
      revision: number;
      snapshot: PeopleSnapshot;
    }
  | { type: "OPERATION_FAILED"; error: PeopleProductError; revision: number };

export function createInitialPeopleWorkflow(currentPerson: PersonIdentity): PeopleWorkflowSnapshot {
  return {
    currentPerson,
    relationships: [],
    error: null,
    inviteCode: null,
    isLoading: true,
    operation: null,
    operationRevision: 0
  };
}

export function reducePeopleWorkflow(
  state: PeopleWorkflowSnapshot,
  event: PeopleWorkflowEvent
): PeopleWorkflowSnapshot {
  switch (event.type) {
    case "LOAD_STARTED":
      return event.revision >= state.operationRevision
        ? {
            ...state,
            error: null,
            isLoading: true,
            operation: "LOAD",
            operationRevision: event.revision
          }
        : state;
    case "OPERATION_STARTED":
      return event.revision >= state.operationRevision
        ? {
            ...state,
            error: null,
            operation: event.operation,
            operationRevision: event.revision
          }
        : state;
    case "SNAPSHOT_RESOLVED":
      return event.revision === state.operationRevision
        ? {
            ...event.snapshot,
            error: null,
            inviteCode: event.inviteCode,
            isLoading: false,
            operation: null,
            operationRevision: state.operationRevision
          }
        : state;
    case "OPERATION_FAILED":
      return event.revision === state.operationRevision
        ? { ...state, error: event.error, isLoading: false, operation: null }
        : state;
  }
}

export function mapPeopleProductError(code: PeopleRepositoryErrorCode): PeopleProductError {
  switch (code) {
    case "PEOPLE_ALREADY_CONNECTED":
      return {
        code: "FS-PRODUCT-PEOPLE-ALREADY-CONNECTED",
        kind: "action_required",
        title: "You're already connected",
        explanation: "This person is already in your People list.",
        recommendedAction: "Choose Send when you're ready to share something.",
        retryable: false
      };
    case "PEOPLE_BLOCKED":
      return {
        code: "FS-PRODUCT-PEOPLE-BLOCKED",
        kind: "action_required",
        title: "This connection isn't available",
        explanation: "You can't connect with this person while the relationship is blocked.",
        recommendedAction: "Unblock the person before creating a new connection.",
        retryable: false
      };
    case "PEOPLE_SELF":
      return {
        code: "FS-PRODUCT-PEOPLE-SELF",
        kind: "action_required",
        title: "You can't connect with yourself",
        explanation: "Choose another person's development pairing code.",
        recommendedAction: "Ask another person to create a pairing code.",
        retryable: false
      };
    case "PEOPLE_INVITE_INVALID":
      return {
        code: "FS-PRODUCT-PEOPLE-INVITE-INVALID",
        kind: "action_required",
        title: "That invitation isn't available",
        explanation: "Ask the person for a new development pairing code.",
        recommendedAction: "Enter a new code and try again.",
        retryable: false
      };
    default:
      return {
        code: "FS-PRODUCT-SERVICE-UNAVAILABLE",
        kind: "action_required",
        title: "FlickSend is temporarily unavailable",
        explanation: "People couldn't be updated right now.",
        recommendedAction: "Try again shortly.",
        retryable: true
      };
  }
}

export function connectedPeople(snapshot: PeopleWorkflowSnapshot): readonly PersonRelationship[] {
  return snapshot.relationships.filter((relationship) => relationship.state === "CONNECTED");
}
