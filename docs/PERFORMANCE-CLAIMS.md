# Performance Claims Registry

| Claim                                                                               | Status                | Evidence class               | Artifact                       | Environment                                       | Limitations                                                       |
| ----------------------------------------------------------------------------------- | --------------------- | ---------------------------- | ------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------- |
| Documented same-host 10 GiB direct transfer completed with verified output.         | `QUALIFIED`           | `SAME_HOST_PHYSICAL_BROWSER` | M10 10 GiB Health-on artifact  | One Windows laptop, Chrome 152                    | Not a LAN, WAN, or cross-device throughput claim.                 |
| Verified committed blocks were not resent in the qualified 10 GiB resume case.      | `QUALIFIED`           | `SAME_HOST_PHYSICAL_BROWSER` | M10 10 GiB resume artifact     | One Windows laptop, Chrome 152                    | Does not prove cross-machine recovery.                            |
| Same-host browser memory did not scale linearly from 1 GiB to 10 GiB in these runs. | `PARTIALLY_QUALIFIED` | `SAME_HOST_PHYSICAL_BROWSER` | M10 1 GiB and 10 GiB artifacts | One Windows laptop, Chrome 152                    | Aggregate Chrome tree, browser/version/environment specific.      |
| Local sequential disk read and write observations exist.                            | `PARTIALLY_QUALIFIED` | `LOCAL_PHYSICAL_DISK`        | M10 disk artifacts             | One Windows laptop, NVMe SSD                      | Cache state unknown; not sustained disk throughput.               |
| Physical network utilization is known.                                              | `NOT_QUALIFIED`       | `NONE`                       | None                           | No authorized second machine or `iperf3` baseline | Same-host rates and nominal Wi-Fi values are invalid substitutes. |
| Physical TURN performance is known.                                                 | `DEFERRED`            | `NONE`                       | None                           | No two-machine TURN scenario                      | Existing M7 evidence remains functional route evidence only.      |

No entry authorizes claims about line speed, connection saturation, LAN rate, competitor performance,
or qualified TURN throughput.

Product-wide claim status, including compatibility, security, brand, and feature boundaries, is defined
in [PRODUCT-CLAIMS.md](PRODUCT-CLAIMS.md). Where the policies differ, the narrower restriction wins.
