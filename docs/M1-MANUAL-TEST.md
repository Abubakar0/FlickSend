# M1 Manual Test

Run the signalling Worker and Engine Lab:

- pnpm --filter @flicksend/signaling dev
- pnpm dev:engine-lab

On two different networks or devices, open the Engine Lab. On the first device, select Create
Session. Enter the displayed code on the second device and select Join.

Verify these outcomes:

- Both browser views report open control and data channels.
- Send HELLO from either side and observe HELLO received on the other side.
- Send the binary test and observe verified 1048576 bytes on the other side.
- Refresh the route diagnostics and record candidate types, protocol, and RTT without logging an
  address.
- Close or interrupt one signalling WebSocket, then allow the browser to reconnect; confirm the
  same session code and open DataChannels remain usable.
- Select Restart ICE on the session creator and confirm both channels recover.

M1 has no TURN configuration, so a cross-network direct connection may fail in restrictive NAT
conditions. Record that as expected M1 coverage, not a delivery failure.
