import type { CreateUpToRequest, UpTo } from "@upto/contracts";
import { call } from "../_shared/api";

/** POST /uptos with publish: true is UpTo.publish() — the contract has no separate publish route. */
export const createUpTo = (body: CreateUpToRequest) => call<UpTo>("createUpTo", { body });
