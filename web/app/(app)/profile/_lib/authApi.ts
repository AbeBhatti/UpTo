/**
 * Typed wrappers for the auth and verification routes (Abe's endpoints).
 * Shapes are exactly @upto/contracts — nothing is reshaped on the client.
 */
import type {
  ApiResponse,
  AuthResponse,
  ConfirmCodeRequest,
  ConfirmCodeResponse,
  SendCodeRequest,
  SendCodeResponse,
  SignInRequest,
  SignUpRequest,
  SwitchAccountRequest,
} from "@upto/contracts";
import { call } from "../../create/_shared/api";

export const signUp = (body: SignUpRequest) => call<AuthResponse>("signUp", { body });
export const signIn = (body: SignInRequest) => call<AuthResponse>("signIn", { body });

export const sendCode = (body: SendCodeRequest) => call<SendCodeResponse>("sendCode", { body });
export const confirmCode = (body: ConfirmCodeRequest): Promise<ApiResponse<ConfirmCodeResponse>> =>
  call<ConfirmCodeResponse>("confirmCode", { body });

/** The contract doesn't declare this response yet; AuthResponse is assumed. */
export const switchAccount = (body: SwitchAccountRequest) => call<AuthResponse>("switchAccount", { body });
