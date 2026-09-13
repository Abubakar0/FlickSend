# Transfer State Mapping

## Purpose

This is the product-layer mapping for future UI. It does not change protocol states. Product UI must
derive its status from a session-level reducer that applies the precedence rules below, rather than
rendering raw engine, ICE, or WebRTC state strings.

## Mapping

| Product state           | Engine/protocol inputs                                                                                        | Ordinary product meaning                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PREPARING`             | `IDLE`, `SELECTED`, `PREPARING`                                                                               | Preparing the selected items.                                                                    |
| `WAITING_FOR_RECIPIENT` | `READY`, a valid offer awaiting acceptance, or connection `WAITING_FOR_PEER`                                  | Waiting for the recipient.                                                                       |
| `CONNECTING`            | `SIGNALLING_CONNECTING`, `NEGOTIATING`, `CONNECTING`, `CONNECTED` before payload transfer                     | Connecting securely to the recipient.                                                            |
| `TRANSFERRING`          | `SENDING`, `RECEIVING`                                                                                        | Sending or receiving data. Show progress and verified-progress language, not frame/block detail. |
| `RECONNECTING`          | transfer or connection `RECONNECTING`, an active recoverable route replacement                                | Connection interrupted. Verified progress is safe. Reconnecting...                               |
| `PAUSED`                | `PAUSED`                                                                                                      | Transfer is paused by an allowed product action.                                                 |
| `VERIFYING`             | `FINALIZING`, `TRANSFER_BYTES_COMPLETE`, `VERIFYING`, `VERIFIED`                                              | Checking that everything arrived correctly.                                                      |
| `COMPLETED`             | `DELIVERED` only                                                                                              | Completed and verified.                                                                          |
| `FAILED`                | Terminal `FAILED`, terminal `INTEGRITY_FAILED`, route recovery exhausted, terminal source/destination failure | The transfer cannot continue without an explicit user action or a new transfer.                  |
| `CANCELED`              | `CANCELLING`, `CANCELLED`                                                                                     | The sender or recipient canceled the transfer.                                                   |

The legacy internal `COMPLETED` state is not enough for product `COMPLETED`: the product reducer must
require observed `DELIVERED` for the same transfer identity and receiver-authoritative verification.

## Precedence And Transitions

1. `COMPLETED` wins only when `DELIVERED` is present. No other state can synthesize completion.
2. A recoverable transport loss maps to `RECONNECTING`, not `FAILED`; route recovery remains visible
   until the engine reports a terminal recovery failure.
3. `VERIFYING` continues while integrity retries are active. A terminal integrity failure maps to
   `FAILED` and must say nothing was marked complete.
4. `PAUSED` is intentional and suppresses stall/bottleneck diagnosis. It is not a network failure.
5. `CANCELED` is user intent and remains distinct from `FAILED`.
6. A destination finalization failure, missing/unverified block, absent/mismatched manifest root, or
   exhausted integrity retry budget maps to `FAILED`, never `COMPLETED`.

## Copy Boundary

Normal UI must not show ICE gathering, SDP, TURN allocation, candidate addresses, block ACKs, SHA
state, protocol versions, or RTCDataChannel state. Optional diagnostics may use only safe route labels
such as `Direct` or `Relayed`; it must not disclose credentials, addresses, candidate data, or SDP.
