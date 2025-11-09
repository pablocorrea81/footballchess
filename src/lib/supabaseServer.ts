import { cookies } from "next/headers";
import {
  createRouteHandlerClient,
  createServerActionClient,
  createServerComponentClient,
} from "@supabase/auth-helpers-nextjs";

import type { Database } from "./database.types";

export const createServerSupabaseClient = () =>
  createServerComponentClient<Database>({ cookies });

export const createRouteSupabaseClient = () =>
  createRouteHandlerClient<Database>({ cookies });

export const createServerActionSupabaseClient = () =>
  createServerActionClient<Database>({ cookies });

