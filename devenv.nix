{ pkgs, config, ... }:

let
  root = config.devenv.root;

  # ------------------------------------------------------------------ umami --
  # Local analytics. nixpkgs' umami is linux-only (its Prisma engines are
  # per-platform), so on darwin we run it from source the way
  # https://umami.is/docs/install describes: clone, pnpm install, build, then
  # serve the Next.js standalone output. The checkout and its build live under
  # .devenv/ (git-ignored), so `devenv up` owns them and they never enter git.
  umamiVersion = "3.3.1";
  umamiTag = "v${umamiVersion}";
  umamiDir = "${root}/.devenv/state/umami";
  umamiBuiltMarker = "${umamiDir}/.devenv-built-${umamiVersion}";
  umamiPort = 3000;

  # --------------------------------------------------------------- postgres --
  # PGDATA stays at devenv's default, .devenv/state/postgres: inside the project
  # and git-ignored.
  umamiDbName = "umami";
  umamiDbUser = "umami";
  umamiDbPassword = "umami";

  # services.postgres listens on TCP (see listen_addresses below), so the port is
  # allocated here: 5432 unless something else already holds it.
  umamiDbPort = config.processes.postgres.ports.main.value;
  umamiDatabaseUrl = "postgresql://${umamiDbUser}:${umamiDbPassword}@127.0.0.1:${toString umamiDbPort}/${umamiDbName}";

  # Local-only values: the service binds to loopback with throwaway credentials,
  # and production analytics keeps running on cloud.umami.is.
  umamiEnv = {
    DATABASE_URL = umamiDatabaseUrl;
    APP_SECRET = "devenv-local-umami-secret-2f6b1d90c4a75e38b0f4a1c6d93e2751";
    HOSTNAME = "127.0.0.1";
    PORT = toString umamiPort;
    NODE_ENV = "production";
    DISABLE_TELEMETRY = "1";
    DISABLE_UPDATES = "1";
  };
in
{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24; # CI runs node@24
    pnpm = {
      enable = true;
      package = pkgs.pnpm_12; # package.json pins pnpm@12.4.2
    };
  };

  packages = [ pkgs.git ];

  # Workspace dependencies. pnpm only refreshes its own lockfile copy under
  # node_modules when it actually changes something, so keep our own copy and
  # compare against that: the install is skipped while it still matches.
  tasks."pnpm:install" = {
    exec = "pnpm install && cp pnpm-lock.yaml node_modules/.pnpm-lock.copy";
    status = "cmp -s pnpm-lock.yaml node_modules/.pnpm-lock.copy";
    showOutput = true;
  };

  services.postgres = {
    enable = true;
    listen_addresses = "127.0.0.1";
    initialDatabases = [
      {
        name = umamiDbName;
        user = umamiDbUser;
        pass = umamiDbPassword;
      }
    ];
    settings.timezone = "UTC"; # umami asks for UTC
  };

  tasks."umami:setup" = {
    description = "Clone and build Umami ${umamiVersion} into .devenv/state/umami";
    # Version-stamped marker: bump umamiVersion and this runs again.
    status = "test -f ${umamiBuiltMarker}";
    showOutput = true;
    # `prisma generate` wants DATABASE_URL while loading prisma.config.ts, and a
    # live database keeps `next build` honest if it ever touches one.
    env.DATABASE_URL = umamiDatabaseUrl;
    after = [ "devenv:processes:postgres" ];
    exec = ''
      set -euo pipefail

      if [ -d ${umamiDir}/.git ]; then
        git -C ${umamiDir} fetch --depth 1 origin tag ${umamiTag}
        git -C ${umamiDir} checkout --force ${umamiTag}
      else
        git clone --depth 1 --branch ${umamiTag} \
          https://github.com/umami-software/umami.git ${umamiDir}
      fi

      cd ${umamiDir}
      pnpm install

      # build-docker is umami's database-independent build (its own Dockerfile
      # uses it); migrations run when the umami process starts.
      pnpm build-docker

      # What the runner stage of umami's Dockerfile does: the standalone server
      # serves .next/static and public/ from inside its own directory.
      rm -rf .next/standalone/.next/static .next/standalone/public
      mkdir -p .next/standalone/.next
      cp -R .next/static .next/standalone/.next/static
      cp -R public .next/standalone/public

      touch ${umamiBuiltMarker}
    '';
  };

  processes.umami = {
    cwd = umamiDir;
    env = umamiEnv;
    # @completed, not @succeeded: a failed Umami build must not take the dev
    # servers down with it.
    after = [
      "devenv:processes:postgres"
      "umami:setup@completed"
    ];
    ready = {
      http.get = {
        port = umamiPort;
        path = "/api/heartbeat";
      };
      initial_delay = 5;
      period = 5;
    };
    exec = ''
      set -euo pipefail
      export PATH="$PWD/node_modules/.bin:$PATH"

      # Same start-up order as umami's scripts/start-docker.sh: apply pending
      # migrations (a fresh database also gets the default admin/umami user),
      # then serve.
      node scripts/check-db.js

      # Seed the website web/.env points Umami at, so local pageviews land in the
      # dashboard instead of being rejected as an unknown website id.
      website_id="$(sed -n 's/^PUBLIC_UMAMI_WEBSITE_ID=//p' ${root}/web/.env 2>/dev/null | tail -n 1 | tr -d '"[:space:]')"
      if [ -z "$website_id" ]; then
        website_id="$(sed -n 's/^PUBLIC_UMAMI_WEBSITE_ID=//p' ${root}/web/.env.example 2>/dev/null | tail -n 1 | tr -d '"[:space:]')"
      fi
      script_url="$(sed -n 's/^PUBLIC_UMAMI_SCRIPT_URL=//p' ${root}/web/.env 2>/dev/null | tail -n 1 | tr -d '"[:space:]')"
      if [ -n "$script_url" ] && [ "$script_url" != "http://localhost:$PORT/script.js" ]; then
        echo "umami: web/.env sends pageviews to $script_url, not to this instance."
      fi
      if printf '%s' "$website_id" | grep -Eq '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'; then
        echo "umami: seeding website $website_id"
        psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
      INSERT INTO website (website_id, name, domain, user_id, created_by)
      SELECT '$website_id', 'A Day In.xyz', 'localhost', user_id, user_id
      FROM "user" WHERE username = 'admin'
      ON CONFLICT (website_id) DO NOTHING;
      SQL
      else
        echo "umami: no PUBLIC_UMAMI_WEBSITE_ID in web/.env, skipping website seed"
      fi

      exec node .next/standalone/server.js
    '';
  };

  processes.web = {
    cwd = root;
    exec = "pnpm dev:web"; # astro dev on http://localhost:4321
    # Astro 7 detaches itself into a background daemon when it detects an agent
    # environment (am-i-vibing), which would leave an unsupervised dev server
    # behind after `devenv down`. This opt-out keeps it in the foreground, where
    # devenv supervises it.
    env.ASTRO_DEV_BACKGROUND = "1";
    after = [ "pnpm:install@succeeded" ];
  };

  processes.studio = {
    cwd = root;
    exec = "pnpm dev:studio"; # sanity dev on http://localhost:3333
    after = [ "pnpm:install@succeeded" ];
  };

  enterShell = ''
    echo
    echo "web     http://localhost:4321"
    echo "studio  http://localhost:3333"
    echo "umami   http://localhost:${toString umamiPort}   (admin / umami)"
    echo
    echo "devenv up               # postgres + umami + web + studio"
    echo "devenv up web studio    # dev servers only"
    echo
  '';
}
