# Compatibility summary

| App | Project | Verdict | Files | Widgets | Stateful | Stores | Unsupported | Unknown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| app_a | `hello_bridge` | **High Compatibility** | 7 | 40 | 3 | 1 | 0 | 0 |
| app_b | `shop_bridge` | **Low Compatibility** | 10 | 62 | 3 | 1 | 13 | 0 |

## app_a — High Compatibility

Every construct found is inside the frozen MVP subset, or is a recognised widget with a planned mapping. Nothing in this application requires a capability the web lacks. It is not free of conversion issues, however: 1 warning(s) (W01) describe constructs that convert imperfectly and need a decision or an override.

Warnings: `W01`

## app_b — Low Compatibility

The application depends on capabilities that do not exist in a browser at all — web-incompatible imports (dart:isolate, dart:ffi, dart:io), platform channels and isolates. These are not gaps in the compiler; they are gaps in the target platform. Converting this application means a human first decides what those capabilities become on the web. The UI layer itself may still convert well — see the supported/partial lists.

Warnings: `W02`, `W03`, `W04`, `W05`, `W06`, `W07`, `W08`, `W08`, `W08`, `W09`

