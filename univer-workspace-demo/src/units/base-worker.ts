import { UniverRemoteBasesPlugin } from "@univerjs-pro/bases";
import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import { LocaleType, LogLevel, Univer } from "@univerjs/core";
import { UniverRPCWorkerThreadPlugin } from "@univerjs/rpc";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {},
  logLevel: LogLevel.WARN,
});

univer.registerPlugin(UniverProFormulaEnginePlugin);
univer.registerPlugin(UniverRemoteBasesPlugin);
univer.registerPlugin(UniverRPCWorkerThreadPlugin);

const workerScope = self as typeof self & { univer?: Univer };
workerScope.univer = univer;
