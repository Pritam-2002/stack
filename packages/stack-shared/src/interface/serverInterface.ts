import { KnownErrors } from "../known-errors";
import { AccessToken, InternalSession, RefreshToken } from "../sessions";
import { StackAssertionError } from "../utils/errors";
import { Result } from "../utils/results";
import {
  ClientInterfaceOptions,
  StackClientInterface
} from "./clientInterface";
import { CurrentUserCrud } from "./crud/current-user";
import { TeamMembershipsCrud } from "./crud/team-memberships";
import { TeamPermissionsCrud } from "./crud/team-permissions";
import { TeamsCrud } from "./crud/teams";
import { UsersCrud } from "./crud/users";

export type ServerAuthApplicationOptions = (
  & ClientInterfaceOptions
  & (
    | {
      readonly secretServerKey: string,
    }
    | {
      readonly projectOwnerSession: InternalSession,
    }
  )
);

export class StackServerInterface extends StackClientInterface {
  constructor(public override options: ServerAuthApplicationOptions) {
    super(options);
  }

  protected async sendServerRequest(path: string, options: RequestInit, session: InternalSession | null, requestType: "server" | "admin" = "server") {
    return await this.sendClientRequest(
      path,
      {
        ...options,
        headers: {
          "x-stack-secret-server-key": "secretServerKey" in this.options ? this.options.secretServerKey : "",
          ...options.headers,
        },
      },
      session,
      requestType,
    );
  }

  protected async sendServerRequestAndCatchKnownError<E extends typeof KnownErrors[keyof KnownErrors]>(
    path: string,
    requestOptions: RequestInit,
    tokenStoreOrNull: InternalSession | null,
    errorsToCatch: readonly E[],
  ): Promise<Result<
    Response & {
      usedTokens: {
        accessToken: AccessToken,
        refreshToken: RefreshToken | null,
      } | null,
    },
    InstanceType<E>
  >> {
    try {
      return Result.ok(await this.sendServerRequest(path, requestOptions, tokenStoreOrNull));
    } catch (e) {
      for (const errorType of errorsToCatch) {
        if (e instanceof errorType) {
          return Result.error(e as InstanceType<E>);
        }
      }
      throw e;
    }
  }

  async getServerUserByToken(session: InternalSession): Promise<CurrentUserCrud['Server']['Read'] | null> {
    const responseOrError = await this.sendServerRequestAndCatchKnownError(
      "/users/me",
      {},
      session,
      [KnownErrors.CannotGetOwnUserWithoutUser],
    );
    if (responseOrError.status === "error") {
      if (responseOrError.error instanceof KnownErrors.CannotGetOwnUserWithoutUser) {
        return null;
      } else {
        throw new StackAssertionError("Unexpected uncaught error", { cause: responseOrError.error });
      }
    }
    const response = responseOrError.data;
    const user: CurrentUserCrud['Server']['Read'] = await response.json();
    if (!(user as any)) throw new StackAssertionError("User endpoint returned null; this should never happen");
    return user;
  }

  async getServerUserById(userId: string): Promise<Result<UsersCrud['Server']['Read']>> {
    const response = await this.sendServerRequest(
      `/users/${userId}`,
      {},
      null,
    );
    const user: CurrentUserCrud['Server']['Read'] | null = await response.json();
    if (!user) return Result.error(new Error("Failed to get user"));
    return Result.ok(user);
  }

  async listServerCurrentUserTeamPermissions(
    options: {
      teamId: string,
      recursive: boolean,
    },
    session: InternalSession
  ): Promise<TeamPermissionsCrud['Server']['Read'][]> {
    const response = await this.sendServerRequest(
      `/team-permissions?team_id=${options.teamId}&user_id=me&recursive=${options.recursive}`,
      {},
      session,
    );
    const result = await response.json() as TeamPermissionsCrud['Server']['List'];
    return result.items;
  }

  async listServerCurrentUserTeams(session: InternalSession): Promise<TeamsCrud['Server']['Read'][]> {
    const response = await this.sendServerRequest(
      "/teams?user_id=me",
      {},
      session,
    );
    const result = await response.json() as TeamsCrud['Server']['List'];
    return result.items;
  }

  async listServerUsers(): Promise<UsersCrud['Server']['Read'][]> {
    const response = await this.sendServerRequest("/users", {}, null);
    const result = await response.json() as UsersCrud['Server']['List'];
    return result.items;
  }

  async listServerTeams(): Promise<TeamsCrud['Server']['Read'][]> {
    const response = await this.sendServerRequest("/teams", {}, null);
    const result = await response.json() as TeamsCrud['Server']['List'];
    return result.items;
  }

  async listServerTeamUsers(teamId: string): Promise<UsersCrud['Server']['Read'][]> {
    const response = await this.sendServerRequest(`/users?team_id=${teamId}`, {}, null);
    const result = await response.json() as UsersCrud['Server']['List'];
    return result.items;
  }

  /* when passing a session, the user will be added to the team */
  async createServerTeam(data: TeamsCrud['Server']['Create'], session?: InternalSession): Promise<TeamsCrud['Server']['Read']> {
    const response = await this.sendServerRequest(
      "/teams",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      },
      session || null
    );
    return await response.json();
  }

  async updateServerTeam(teamId: string, data: TeamsCrud['Server']['Update']): Promise<TeamsCrud['Server']['Read']> {
    const response = await this.sendServerRequest(
      `/teams/${teamId}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      },
      null,
    );
    return await response.json();
  }

  async deleteServerTeam(teamId: string): Promise<void> {
    await this.sendServerRequest(
      `/teams/${teamId}`,
      { method: "DELETE" },
      null,
    );
  }

  async addServerUserToTeam(options: {
    userId: string,
    teamId: string,
  }): Promise<TeamMembershipsCrud['Server']['Read']> {
    const response = await this.sendServerRequest(
      `/team-memberships/${options.teamId}/${options.userId}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      null,
    );
    return await response.json();
  }

  async removeServerUserFromTeam(options: {
    userId: string,
    teamId: string,
  }) {
    await this.sendServerRequest(
      `/team-memberships/${options.teamId}/${options.userId}`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      null,
    );
  }

  async updateServerUser(userId: string, update: UsersCrud['Server']['Update']): Promise<UsersCrud['Server']['Read']> {
    const response = await this.sendServerRequest(
      `/users/${userId}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(update),
      },
      null,
    );
    return await response.json();
  }

  async listServerTeamMemberPermissions(
    options: {
      teamId: string,
      userId: string,
      recursive: boolean,
    }
  ): Promise<TeamPermissionsCrud['Server']['Read'][]> {
    const response = await this.sendServerRequest(
      `/team-permissions?team_id=${options.teamId}&user_id=${options.userId}&recursive=${options.recursive}`,
      {},
      null
    );
    const result = await response.json() as TeamPermissionsCrud['Server']['List'];
    return result.items;
  }

  async grantServerTeamUserPermission(teamId: string, userId: string, permissionId: string) {
    await this.sendServerRequest(
      `/team-permissions/${teamId}/${userId}/${permissionId}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      null,
    );
  }

  async revokeServerTeamUserPermission(teamId: string, userId: string, permissionId: string) {
    await this.sendServerRequest(
      `/team-permissions/${teamId}/${userId}/${permissionId}`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      null,
    );
  }

  async deleteServerServerUser(userId: string) {
    await this.sendServerRequest(
      `/users/${userId}`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      null,
    );
  }
}
