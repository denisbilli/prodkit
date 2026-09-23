import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyDotnetDep, hasAnyElixirDep, hasAnyGoDep, hasAnyGradleDep, hasAnyPhpDep, hasAnyPyDep, hasAnyRubyDep, hasAnyRustDep } from './detectContext';
import { searchInFiles, type TextMatch } from '../utils/textSearch';
import { readRoleChecks } from './structural/roleChecks';
import { evidenceOrSearch, searchedFor } from './absenceEvidence';
import { fileNameEvidence, searchFileNames } from './fileNames';
import { readPackageValueUses } from './structural/valuesFromPackage';
import { anyFileImportsExpress, readOwnershipChecks } from './structural/ownershipChecks';
import { wentUnasked } from './readingDepth';
import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * In a product that talks to a model, `role` usually means who is speaking.
 *
 * `m.role === "assistant"` is a chat transcript, not an authorization check, and three
 * repositories in the verification corpus were credited with a role model on the
 * strength of one line of chat UI. One of them — an AI product with no roles anywhere —
 * had that single line as the only evidence, and the report told its owner their
 * authorization depth was "basic role checks" rather than nothing at all.
 *
 * Only the literals that cannot be an authorization role: `assistant`, `system`, `tool`,
 * `function`, `developer`, `model`, `bot`. A comparison against `'user'` or `'admin'` is
 * left alone — "user" is a perfectly ordinary role name, and a rule that dropped it
 * would blind the detector to every two-role application.
 *
 * A line that pairs `role === 'user'` with nothing recognisable still gets through. That
 * is the honest limit of what the shape of a line can tell.
 */
/**
 * Showing somebody their role is not checking it.
 *
 * `{m.role === 'editor' ? <Pencil /> : <Eye />}` picks an icon. `{{ msg.role === 'user'
 * ? '👤' : '🤖' }}` picks an avatar. Both are the interface displaying a value, and
 * neither decides whether anything is allowed — which is what this detector claims when
 * it fires.
 *
 * It costs nothing where a role model exists: an application that renders a role almost
 * always guards on it somewhere too, and those lines are untouched. Where the rendered
 * line was the *only* evidence, the claim rested on a label.
 */
const ROLE_IN_MARKUP = /[<{][^<>{}]*\brole\s*===?=?/;

const CHAT_TURN_ROLE = /role\s*===?=?\s*["'`](?:assistant|system|tool|function|developer|model|bot)["'`]|["'`](?:assistant|system)["'`]\s*===?=?\s*\w*\.?role/i;

function excludeChatTurnRoles(matches: TextMatch[]): TextMatch[] {
  return matches.filter(
    (match) => !CHAT_TURN_ROLE.test(match.snippet) && !ROLE_IN_MARKUP.test(match.snippet),
  );
}

function depEvidence(deps: string[]): DetectorEvidence[] {
  return deps.map((d) => ({ type: 'dependency', value: d }));
}

function snippetEvidence(matches: Array<{ snippet: string; file: string; line: number }>): DetectorEvidence[] {
  return matches.map((m) => ({ type: 'snippet', value: m.snippet, file: m.file, line: m.line }));
}

export async function detectAuth(ctx: DetectContext): Promise<DetectorResult[]> {
  const sourceFiles = ctx.files.source;
  // Hand-rolled Express auth is only one shape. Most repositories written in the last
  // few years — and nearly everything produced by AI app builders — reach for a managed
  // auth library instead, and looking only for jsonwebtoken/bcrypt reported those as
  // having no authentication at all.
  const managedAuthDeps = hasAnyDep(ctx, [
    'next-auth',
    '@auth/core',
    '@auth/prisma-adapter',
    '@clerk/nextjs',
    '@clerk/clerk-react',
    '@clerk/backend',
    '@supabase/supabase-js',
    '@supabase/auth-helpers-nextjs',
    '@supabase/ssr',
    'lucia',
    'better-auth',
    '@kinde-oss/kinde-auth-nextjs',
    '@workos-inc/node',
    '@auth0/nextjs-auth0',
    'firebase-admin',
    'passport',
  ]);
  const managedAuthPyDeps = hasAnyPyDep(ctx, ['django-allauth', 'authlib', 'python-jose', 'fastapi-users', 'flask-login']);

  /** Identity handed to somebody else, in every ecosystem this analyzer reads. */
  const externalIdentityProviders = [
    ...managedAuthDeps,
    ...hasAnyPyDep(ctx, ['django-allauth', 'authlib', 'social-auth-app-django']),
    ...hasAnyRustDep(ctx, ['oauth2', 'openidconnect']),
    ...hasAnyGradleDep(ctx, ['spring-boot-starter-oauth2-client', 'com.okta.spring']),
    ...hasAnyDotnetDep(ctx, ['Microsoft.AspNetCore.Authentication.OpenIdConnect', 'Microsoft.Identity.Web']),
    ...hasAnyElixirDep(ctx, ['ueberauth', 'assent', 'openid_connect']),
  ];

  /** And a password of its own, which is what makes a reset flow something to have. */
  const storesAPasswordItself = [
    ...hasAnyDep(ctx, ['bcrypt', 'bcryptjs', 'argon2', 'scrypt-kdf', 'passport-local']),
    ...hasAnyPyDep(ctx, ['django', 'passlib', 'bcrypt', 'argon2-cffi', 'werkzeug']),
    ...hasAnyRustDep(ctx, ['argon2', 'rust-argon2', 'bcrypt', 'scrypt', 'password-hash', 'pbkdf2']),
    ...hasAnyGradleDep(ctx, ['spring-security-crypto', 'org.mindrot:jbcrypt']),
    ...hasAnyDotnetDep(ctx, ['Microsoft.AspNetCore.Identity']),
    ...hasAnyElixirDep(ctx, ['bcrypt_elixir', 'argon2_elixir', 'pbkdf2_elixir']),
  ];
  /**
   * The packages that do the authenticating, as distinct from the words people use
   * around them.
   *
   * An Italian business application hashing with argon2 and holding sessions with
   * iron-session came back `auth.core: missing` — a complete, working sign-in
   * reported as absent, and eight findings wrong behind it, because its routes are
   * `/accedi` and `/registrati` and neither package was on the list.
   *
   * Nothing about that application is unusual. It is what this product's own thesis
   * says out loud: the analyzer was reading a language rather than a program.
   */
  const AUTH_PACKAGES = [
    'jsonwebtoken',
    'jose',
    'bcrypt',
    'bcryptjs',
    'bcrypt-ts',
    'argon2',
    '@node-rs/argon2',
    'scrypt-kdf',
    '@phc/format',
    'express-session',
    'cookie-session',
    'iron-session',
    'cookie-parser',
    'oslo',
    '@oslojs/crypto',
    '@auth/core',
  ];
  /**
   * The same question in Elixir, where the packages have their own names.
   *
   * `bcrypt_elixir` hashes the password, `guardian` and `pow` hold the session,
   * `ueberauth` hands identity to a provider. plausible declares three of them and
   * reported no authentication at all, because none of these words appears in any of
   * the lists above.
   */
  const elixirAuthDeps = hasAnyElixirDep(ctx, [
    'bcrypt_elixir',
    'argon2_elixir',
    'pbkdf2_elixir',
    'guardian',
    'pow',
    'ueberauth',
    'assent',
    'joken',
  ]);
  const authDeps = [
    ...hasAnyDep(ctx, AUTH_PACKAGES),
    ...managedAuthDeps,
    ...managedAuthPyDeps,
    ...elixirAuthDeps,
  ];
  const sessionDeps = [...hasAnyDep(ctx, ['express-session', 'cookie-session']), ...managedAuthDeps];
  /**
   * `qrcode` is not a second factor. An authenticator's setup shows one, and so does a
   * share link, a payment request and a Wi-Fi password: immich renders shared-album links
   * with it and has no second factor at all, and was reported as having one.
   */
  const twoFaDeps = [
    ...hasAnyDep(ctx, ['speakeasy', 'pyotp', '@simplewebauthn/server', 'otplib']),
    /** `nimble_totp` is the Elixir one, and plausible ships it. */
    ...hasAnyElixirDep(ctx, ['nimble_totp']),
    /**
     * The TOTP library of every other ecosystem, named by its registry.
     *
     * The second-factor search also read `otp` as a word, and a word is what it matched:
     * hoppscotch's desktop agent pairs with the app through a one-time code and was
     * credited with a second factor it does not have. Dropping the word took two real
     * ones away — listmonk verifies with `github.com/pquerna/otp`, traccar with
     * `com.warrenstrange:googleauth` — so the packages are the anchor instead.
     */
    ...hasAnyGoDep(ctx, ['github.com/pquerna/otp', 'github.com/xlzd/gotp']),
    ...hasAnyGradleDep(ctx, ['com.warrenstrange:googleauth', 'dev.samstevens.totp:totp', 'com.eatthepath:java-otp']),
    ...hasAnyRubyDep(ctx, ['rotp', 'devise-two-factor']),
    ...hasAnyPhpDep(ctx, ['pragmarx/google2fa', 'spomky-labs/otphp', 'scheb/2fa-bundle', 'scheb/2fa-totp']),
    ...hasAnyDotnetDep(ctx, ['Otp.NET']),
    ...hasAnyRustDep(ctx, ['totp-rs']),
    ...hasAnyPyDep(ctx, ['django-otp']),
  ];

  const routeSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /\/(login|register|logout|signin|signup|sign-in|sign-up)\b/i,
      /requireAuth/i,
      /auth\s*middleware/i,
      /django\.contrib\.auth/i,
      /AUTH_USER_MODEL/i,
      // Framework-native shapes: NextAuth handlers, Clerk and Supabase helpers.
      /NextAuth\(/,
      /\bauth\(\)/,
      /getServerSession/,
      /currentUser\(/,
      /createServerClient/,
      /\[\.\.\.nextauth\]/i,
      /**
       * JAX-RS names a resource without the slash.
       *
       * `traccar/traccar` signs people in by POSTing to `@Path("session")` and every
       * pattern above wants `/login` with its slash, so a Java server whose routes are all
       * plain English was reported as routed in a language this could not read, and its
       * email verification, export and erasure came out `unknown`. The annotation is
       * JAX-RS's; `session` joins the sign-in words only inside it, where it can only be
       * the resource a client creates to log in — Rails' `resource :session` is the same
       * idea.
       */
      /@Path\(\s*"\/?(?:login|logout|register|signin|signup|session)"\s*\)/i,
    ],
    30
  );
  /**
   * Identity the platform supplies, under a name the author did not choose.
   *
   * Cloudflare Access sits in front of Orange Meets and puts a signed JWT on every
   * request as the `CF_Authorization` cookie; `app/root.tsx` decodes it, checks its
   * expiry and redirects when it is about to lapse. There is no auth package in the
   * manifest and no `/login` route, because signing in happens before the request
   * reaches the application at all — so the report told a product behind an identity
   * proxy that "anyone who finds a URL can use the product and read whatever it
   * exposes".
   *
   * The same arrangement has a name on every platform: Google IAP, an AWS ALB with
   * OIDC, Azure App Service's Easy Auth. Each one publishes a fixed header or cookie,
   * and reading it is how an application asks who is calling. Those names are the
   * anchor — nobody in the repository invented `x-amzn-oidc-data`.
   *
   * It says the request is authenticated, not that the application authorizes
   * anything: `hasAuthz` is decided separately and stays untouched.
   */
  const PLATFORM_IDENTITY = [
    /\bCF_Authorization\b/,
    /\bCf-Access-Jwt-Assertion\b/i,
    /\bcf-access-authenticated-user-email\b/i,
    /\bx-goog-iap-jwt-assertion\b/i,
    /\bx-goog-authenticated-user-email\b/i,
    /\bx-amzn-oidc-(?:data|identity|accesstoken)\b/i,
    /\bX-MS-CLIENT-PRINCIPAL(?:-NAME|-ID)?\b/i,
  ];
  const platformIdentity = await searchInFiles(ctx.root, sourceFiles, PLATFORM_IDENTITY, 10);


  /**
   * A picture of a padlock is not a padlock.
   *
   * immich's settings page uses Material Design's `mdiTwoFactorAuthentication` icon for its
   * OAuth section, and that one identifier was the only line behind its second factor.
   * Icon sets name their glyphs after what they depict — `mdi…` for Material Design,
   * `…Icon` for lucide, heroicons and the rest — so the icon's name is removed before the
   * line is read.
   */
  const ICON_IDENTIFIER = /\b(?:mdi[A-Z]\w*|\w+Icon)\b/g;
  /**
   * A column every ASP.NET Identity schema has, whether or not anyone turns it on.
   *
   * `IdentityUser` declares `TwoFactorEnabled`, so it appears in every migration snapshot
   * of every application that uses Identity. `Kareadita/Kavita` has twenty of them and no
   * second factor, and was reported as having one. The bare property is the framework's
   * default; the calls that use it — `SetTwoFactorEnabledAsync`, `TwoFactorSignInAsync`,
   * `GenerateTwoFactorTokenAsync` — are left alone, and they are what a real one has.
   */
  const IDENTITY_COLUMN = /\bTwoFactorEnabled\b/g;
  /**
   * A one-time password as a second factor: something verified, or the secret it is
   * verified against.
   *
   * `otp` as a bare word was the pattern, and it read three other things. Every Phoenix
   * application declares `use Phoenix.Endpoint, otp_app: :shop` — OTP there is Erlang's
   * Open Telecom Platform — and two fixtures were credited with a second factor for being
   * Elixir. hoppscotch's desktop agent pairs with the app through `generate_otp()` and
   * `get_otp()`, a registration code. And before that, `NotPresent` and `DotPivot` as
   * substrings. What a second factor has that none of them do is a secret and a check:
   * `otp_secret`, `otpSecret`, `verifyOtp`, `verify_totp`, an `otpCode` submitted by the
   * user, or `totp` itself. The packages above answer for every library that does it.
   */
  const OTP_AS_A_SECOND_FACTOR = /\bt?otp[_-]?(?:secret|code|token|uri|enabled|verified)\b|\bt?otp(?:Secret|Code|Token|Uri|Enabled|Verified)\b|\b(?:verify|check|validate)[_-]?t?otp\b|\b(?:verify|check|validate)T?Otp\b|\btotp\b/i;
  const twoFaSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/two[_-]?factor/i, OTP_AS_A_SECOND_FACTOR],
    20,
    (match) => {
      const line = match.snippet.replace(ICON_IDENTIFIER, '').replace(IDENTITY_COLUMN, '');
      return /two[_-]?factor/i.test(line) || OTP_AS_A_SECOND_FACTOR.test(line);
    },
  );
  const apiKeySignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /**
       * A key this project checks, not a key it holds.
       *
       * `apiKey` and `API_KEY` matched both, and almost every project that calls a
       * model or a maps service has one of its own. `--api-key YOUR_API_KEY_HERE`, in
       * the usage text of a script that downloads from YouTube, was enough to decide a
       * one-page Streamlit application offers an API to other callers — and it was then
       * asked at medium severity to restrict cross-origin access to it.
       *
       * What distinguishes a provider is reading a key out of an incoming request, or
       * looking one up to see whether it is valid. Holding a secret is what a client
       * does.
       */
      /x-api-key/i,
      /**
       * `authorization` on its own is how every session and bearer-token guard reads
       * its header: `if (!req.headers.authorization) return res.status(401)` is
       * authentication, not API keys, and matching it made a hardened Express fixture
       * claim an API-key scheme it does not have.
       */
      /headers?\s*[[.(]\s*['"]?x-api-key/i,
      /**
       * A verb on its own does not say which side you are on. `check_api_key(api_key)`
       * in a script that downloads from YouTube is a client making sure its own key
       * looks right before spending a request on it. What it cannot be is a store of
       * keys you issued.
       */
      /api[_-]?keys?\s*\.\s*(find|where|get|create)/i,
      /hashed?[_-]?(api[_-]?)?key/i,
      /token\s*scope/i,
      /**
       * A scheme the framework names, where the project need not say "api key" at all.
       *
       * netbox issues API tokens — a `Token` model in `users/models/tokens.py`, and
       * `'netbox.api.authentication.TokenAuthentication'` listed in DRF's
       * `DEFAULT_AUTHENTICATION_CLASSES` — and was told it offers no API keys. It is the
       * primary way anything talks to NetBox.
       *
       * None of the patterns above could see it: they look for `x-api-key`, a store of
       * keys, or a hashed one, and DRF's scheme is a class name in a settings tuple. The
       * name belongs to the framework — `TokenAuthentication` is DRF's base class,
       * `authtoken` its app, `HasApiTokens` is Laravel Sanctum's trait and
       * `authenticate_with_http_token` is Rails'. Each says a caller presents a token it
       * was issued, which is the question.
       */
      /\bTokenAuthentication\b|rest_framework\.authtoken/,
      /\bHasApiTokens\b|laravel\/sanctum/,
      /\bauthenticate_with_http_token\b/,
      /**
       * A type called ApiKey is a key you issue. A variable called apiKey is one you hold.
       *
       * That distinction is this whole list's subject, and the patterns above draw it
       * with a header name, a store, or a hash. A statically typed backend draws it in
       * the type system instead: `dani-garcia/vaultwarden` implements Bitwarden's
       * organization API keys as `OrgApiKeyId` and `OrgApiKeyLoginJwtClaims` in
       * `src/auth.rs`, and was told it offers no API keys.
       *
       * Declaring a type for something is modelling it, and nothing models a key it
       * merely holds — a held key is a `String` read out of the environment. Capitalised
       * because that is what distinguishes a type from a variable in Rust, Go, C#, Java
       * and TypeScript alike.
       */
      /**
       * Go writes an initialism in capitals — `APIKey`, not `ApiKey` — and that is the
       * language's own style rule. getfider/fider issues a key per user, looks it up with
       * `type GetUserByAPIKey struct` and rotates it with `RegenerateAPIKey`, and was told
       * it offers no API keys. A key issued as a token is the same thing under another
       * noun: glitchtip's is `class APIToken(CreatedModel)`, GitHub's and GitLab's are
       * personal access tokens.
       */
      /\b(struct|class|type|enum|interface|record)\s+\w*(?:ApiKey|APIKey|ApiToken|APIToken|PersonalAccessToken)/,
      /\b\w*(?:ApiKey|APIKey)(?:Id|ID|Login|Claims|Entity|Model|Repository|Table)\b/,
    ],
    20
  );
  const passwordResetFiles = searchFileNames(sourceFiles, [
    /(password|pwd)[_-]?(reset|recovery)/i,
    /(reset|recover)[_-]?password/i,
    /forgot[_-]?password/i,
  ]);
  const passwordResetSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /forgot\s*password/i,
      /**
       * A path, not a word.
       *
       * `password_reset` anywhere was enough, and two real products without a
       * self-service reset were credited with one on the strength of the word alone:
       * `usememos/memos` declares rate-limit scopes `password_reset_ip` and
       * `password_reset_email` for a flow it has not built, and `immich-app/immich` has an
       * administrator's `prompt-password-reset` command. Removing the bare word changed no
       * verdict across the fixture corpus; what still counts is the path a user is sent
       * to — `/password-reset`, `/password_resets` — beside the forgot, token and
       * recovery patterns around it and the frameworks that ship the flow.
       */
      /\/password[_-]?resets?\b/i,
      /reset\s*token/i,
      /**
       * Django ships the whole flow — token, expiry, single use — behind one include.
       * A report on a real school platform called password reset missing while
       * `path("accounts/", include("django.contrib.auth.urls"))` sat in its urls.py:
       * the words "password" and "reset" appear nowhere, because the framework
       * supplies them.
       */
      /django\.contrib\.auth\.urls/,
      /PasswordReset(View|ConfirmView|DoneView|CompleteView)/,
      /auth_views\.PasswordReset/,
      // The same shape in other frameworks that hand you the flow rather than the words.
      /Devise|devise_for/,
      /Auth::routes\(/,
      /**
       * The same flow, called recovery.
       *
       * supabase/auth is a product whose entire purpose is authentication, and it was
       * reported as having no password reset. Its file says "Password recovery
       * requires an email" and names the type `Recovery`: the words "reset" and
       * "forgot" appear nowhere, because it says the thing differently.
       */
      /password\s*recover(y|ing)?/i,
      /recover(y)?[_-]?password/i,
      /passwordRecovery/,
    ],
    20
  );
  /**
   * JAX-RS writes a path in two halves.
   *
   * `traccar/traccar` resets passwords at `/password/reset`: the class is
   * `@Path("password")`, the method `@Path("reset")`, and the method emails a token that
   * `@Path("update")` redeems. Neither annotation alone says password reset, and the
   * joined path is written nowhere, so a method-level reset is read only in a class whose
   * own path is `password`.
   */
  const resetMethods = await searchInFiles(
    ctx.root,
    sourceFiles.filter((file) => /\.(java|kt)$/.test(file)),
    [/@Path\(\s*"\/?(?:reset|forgot|recover)\w*"\s*\)/],
    5,
  );
  const jaxRsReset: TextMatch[] = [];
  for (const hit of resetMethods) {
    const text = await readTextFileSafe(ctx.root, hit.file);
    if (text && /@Path\(\s*"\/?password"\s*\)/.test(text)) jaxRsReset.push(hit);
  }
  passwordResetSignals.push(...jaxRsReset);
  const emailVerificationSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/verify\s*email/i, /email[_-]?verification/i, /confirm\s*email/i, /isEmailVerified/i],
    20
  );
  const sessionSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/session/i, /cookie/i, /jwt/i, /refresh\s*token/i, /httpOnly/i],
    25
  );

  /**
   * Structure first, text underneath.
   *
   * `excludeChatTurnRoles` below is three patches written in one day, each against a
   * shape the last one missed: a chat transcript, a game's `part.role`, JSX picking an
   * icon. A syntax tree asks the question all three were really about — does this
   * comparison guard something, or label something — and answers it for shapes nobody
   * has thought of yet.
   *
   * `null` means the question could not be asked, because the optional TypeScript
   * dependency is not installed. It is not "no roles found": the two are different
   * answers and confusing them is the mistake this product exists to avoid. When it is
   * null, the text search below runs exactly as before.
   */
  const structuralRoles = await readRoleChecks(ctx.root, sourceFiles);
  const guardedRoles = structuralRoles?.filter((check) => check.kind === 'guard') ?? null;

  /**
   * Two kinds of signal, and only one of them was ever ambiguous.
   *
   * `requireRole(...)`, `isAdmin`, `roles.includes(...)` say what they are in the text:
   * nobody writes `requireRole` to render a label. The comparison — `x.role === 'y'` —
   * is the one that meant three different things in three repositories, and it is the
   * one the tree answers.
   */
  /**
   * Spring says all of this with names it owns, and none of them were here.
   *
   * mall is a Spring Boot shop with a full authorization model — a filter chain built
   * with `authorizeHttpRequests`, a `DynamicAuthorizationManager` comparing the
   * caller's `GrantedAuthority` against the one a path requires, and a
   * `UmsAdminRoleRelationDao` that loads an administrator's roles from the database —
   * and it was told at `medium` that it has no role checks and no permission checks
   * at all.
   *
   * Every word above is Spring Security's or the JSR's: `GrantedAuthority`,
   * `@PreAuthorize`, `@Secured`, `@RolesAllowed`, `hasAuthority`, `hasAnyRole`,
   * `authorizeHttpRequests` and the `antMatchers` it replaced. What mall chose was
   * `Ums`, the prefix on its own classes, and that is exactly what a search must not
   * depend on.
   */
  const SPRING_AUTHORIZATION = [
    /@PreAuthorize\b/,
    /@PostAuthorize\b/,
    /@Secured\b/,
    /@RolesAllowed\b/,
    /\bGrantedAuthority\b/,
    /\bhasAuthority\s*\(/,
    /\bhasAnyAuthority\s*\(/,
    /\bhasAnyRole\s*\(/,
    /\bhasRole\s*\(/,
  ];
  /**
   * `authorizeHttpRequests` is not on that list, and the corpus is why.
   *
   * It was, and `spring-security-defaults` — a fixture whose whole point is a chain
   * with no roles in it, `requests.anyRequest().authenticated()` — started reading as
   * having an authorization model. Every Spring Security setup writes that line: it
   * says the request must be authenticated, which is the question one capability
   * along. The same test Django's `SecurityMiddleware` and Rails' default headers
   * failed — a thing every project has distinguishes nothing.
   *
   * What survives is the part somebody chose: which authority a path requires, and
   * the annotation that says it on a method.
   */

  const unambiguousRoles = [
    ...await searchInFiles(
      ctx.root,
      sourceFiles,
      [/requireRole/i, /isAdmin/i, /SUPER_ADMIN/i, /roles\.includes\(/i],
      20
    ),
    ...await searchInFiles(
      ctx.root,
      sourceFiles,
      SPRING_AUTHORIZATION,
      20,
      /**
       * An import is not a check.
       *
       * `import org.springframework.security.core.GrantedAuthority;` names the type
       * and decides nothing; `grantedAuthorities.stream()` twenty files away is where
       * the caller's authority is compared against the one the path requires. The
       * first version of this cited the import, which is the same complaint pocketbase
       * earned two releases ago — a reader is promised the line that decides.
       *
       * Filtered inside the search rather than after it, so the budget is spent on
       * lines that check something: a Java project has one import per file and they
       * would fill it.
       */
      (match) => !/^\s*import\b/.test(match.snippet),
    ),
  ];

  const comparedRoles = guardedRoles
    ?? excludeChatTurnRoles(
      await searchInFiles(ctx.root, sourceFiles, [/req\.user\.role/i, /user\.role/i, /role\s*===/i], 20),
    );

  const roleSignals = [...unambiguousRoles, ...comparedRoles].slice(0, 20);
  const permissionSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/requirePermission/i, /permission_classes/i, /permissions\.py/i, /authorize\(/i, /\bcan\(/i],
    20
  );
  const resourceLevelSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /**
       * Per-record, which is what this capability claims.
       *
       * `requirePermission` and `permission_classes` were in this list, and they are
       * checks on a route: the capability's own description is "per-record checks that
       * a caller may act on the specific resource, **not just the route**". Three
       * projects were credited with protection against reading another user's rows —
       * one of them on the strength of `permission_classes = [AllowAny]`, a line that
       * says the opposite. They belong to `authz.permissions`, where they already are.
       *
       * `authorize(` keeps its place but needs an argument. `google_calendar.authorize()`
       * is an OAuth handshake, and it was standing in for an ownership check.
       */
      /\bauthorize\(\s*[^)\s]/i,
      /\bcanAccess\(/i,
      /\bhasAccessTo\(/i,
      /ownerId/i,
      /createdBy/i,
      /req\.user\.id/i,
      /userId\s*===/i,
      /organizationId/i,
      /tenantId/i,
      /workspaceId/i,
      /**
       * Django checks ownership inside the view, not in middleware before it.
       *
       * A report said "no resource-level authorization signals detected" of a codebase
       * whose view reads
       * `if not request.user.is_staff and request.user.pk != user.pk: raise
       * PermissionDenied`, with visibility helpers called in every other view. The
       * patterns above are all Express and DRF shaped, so none of that was visible.
       */
      /raise\s+PermissionDenied/,
      /request\.user\.pk\s*!?==/,
      /request\.user\.is_staff/,
      /UserPassesTestMixin/,
      /PermissionRequiredMixin/,
      /@user_passes_test/,
      /get_queryset\([^)]*\)[\s\S]{0,120}filter\([^)]*user/,
      /\bis_visible_to\b/,
      /**
       * Rails checks ownership by comparing the row's foreign key to the signed-in user.
       *
       * The shapes above are Express and Django. `lobsters/lobsters` writes
       * `if @message.recipient_user_id == @user.id` and
       * `@message.author_user_id == @user.id` in its messages controller, and was told
       * it has no per-record authorization at all.
       *
       * `<something>_user_id` is Rails' foreign-key convention rather than a name
       * anybody picked, and comparing one is what an ownership check *is* — there is no
       * other reason to test a row's user column against a value. The same line reads
       * the same way in Python or PHP.
       *
       * The two gems are stronger still: `authorize @record` and `policy_scope` are
       * Pundit's, `load_and_authorize_resource` and `can?` are CanCanCan's, and both
       * libraries exist for this one question. Pundit's `authorize` takes no parentheses
       * in Ruby, which is why the pattern above could not see it.
       */
      /\b\w*_user_id\s*[=!]==?\s*\S/,
      /**
       * The same comparison where the convention capitalises.
       *
       * `gotify/server` guards every message and client route with
       * `app.UserID == auth.GetUserID(ctx)` and `client.UserID != user.ID`, and was told
       * it has no per-record authorization. Go, C# and Java name the field `UserID` or
       * `UserId`, so the snake_case pattern above sees none of it, and the JavaScript
       * `userId ===` needs three equals signs.
       *
       * The right-hand side must be something: `if userID == ""` and `if UserId == nil`
       * are validating an argument, not checking who owns a row.
       */
      /\b\w*User[Ii][Dd]\s*[=!]==?\s*(?!["'`]{2}|nil\b|null\b|undefined\b|0\b|-1\b)\S/,
      /\bpolicy_scope\b|\bauthorize\s+@/,
      /\bload_and_authorize_resource\b|\bcan\?\s*[:(]/,
    ],
    20
  );

  /**
   * Words that only mean tenancy, and words that usually mean something else.
   *
   * `organizationId` and `tenantId` are not written by accident. `workspaceId` and
   * `companyId` are common in SaaS and also in code that talks *about* somebody else's
   * product, so they are corroborated across files before they count.
   *
   * `teamId` was a signal and is gone. In the JavaScript ecosystem it is overwhelmingly
   * Apple's Developer Team ID: `usebruno/bruno`, a desktop API client with no accounts
   * of any kind, was classified as a B2B SaaS with high confidence on the strength of
   * `const teamId = 'W7LPPWA48L'` in its notarization script.
   */
  /**
   * Measured and rejected: a structural anchor for the tenant's name.
   *
   * Every word below is one the author chose, which is the thing this analyzer tries
   * not to depend on. An Italian product whose column is `aziendaId`, carried in the
   * token and present in the `where` of every Prisma query, is as invisible here as an
   * English one that calls its tenant `clientId`. So a structural signal was tried
   * twice, against five real repositories — three multi-tenant (documenso, plane,
   * twenty) and two not (bruno, excalidraw).
   *
   * An identifier that is both put into a signed token and used as a filter key:
   * zero matches in all five, and zero across the fixture corpus. Real code builds the
   * token payload over several lines, and a line-at-a-time search never sees both.
   *
   * The identifier that narrows the most queries: it is the product's main entity, not
   * its tenant. `envelope` (40 files) beats `team` and `organisation` in documenso;
   * `project` (66) beats `workspace` in plane. Only twenty ranks its tenant first.
   *
   * The share of filter lines where an identifier appears beside another one — a
   * tenant narrows a query that is already about something else — does no better:
   * `organisation` scores 0.34 in documenso, below `envelope` at 0.81, and
   * `workspace` does not reach twenty's top six.
   *
   * Two of the five repositories separate cleanly, and both are the negative controls:
   * bruno and excalidraw produce nothing at all. That distinguishes "filters by
   * something" from "filters by nothing" — it does not name the tenant, which is what
   * this capability has to cite.
   *
   * Blindness is not the answer either. A repository with authentication, an ORM and
   * none of these words is usually single-tenant, and `missing` is the right verdict
   * for it. Withdrawing there would turn hundreds of correct answers into no answer to
   * rescue the few written in another language.
   */
  const STRONG_TENANCY = [/organizationId/i, /organization_id/i, /tenantId/i, /tenant_id/i];
  const WEAK_TENANCY = [/workspaceId/i, /workspace_id/i, /companyId/i, /teamId/i, /team_id/i];

  /**
   * A team that has members is an account.
   *
   * "Team" is the third word products use for a tenant, after organization and
   * workspace — and unlike those two it also means a team: a sports application has
   * teams and no tenants. Documenso is the case that made it matter: `teamId` in three
   * hundred and eighty-eight files, `TeamMember` in seventy-nine, `organizationId` in
   * none, and no tenancy detected at all.
   *
   * The pairing is what disambiguates. A membership table beside the team turns a
   * domain entity into an account boundary, which is the same reasoning the detector
   * already applies to weak words: never on its own, always with something that means
   * only one thing.
   */
  const teamMembership = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/teamMember/i, /team_member/i, /teamMembership/i],
    10,
  );
  const teamAsTenant = teamMembership.length > 0
    ? await searchInFiles(ctx.root, sourceFiles, [/teamId/i, /team_id/i], 25)
    : [];

  /**
   * The same pairing, for a company or a workspace.
   *
   * `akaunting/akaunting` is multi-company accounting: `company_id` on every table, a
   * global scope that filters by it, and `user_companies` saying which people belong to
   * which company. `companyId` is weak for good reason — CRMs and invoicing tools store
   * the customer's company everywhere — so it never counted, and a B2B product was read
   * as a consumer app at high confidence.
   *
   * A join between people and companies is what a customer's company field never has.
   * Laravel names it `company_user` or, as akaunting does, `user_companies`; the model is
   * `CompanyUser` or `UserCompany`; a workspace's is `workspace_members`.
   */
  const companyMembership = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /\b(?:user_compan(?:y|ies)|compan(?:y|ies)_users?|compan(?:y|ies)_members?|user_workspaces?|workspace_(?:users|members?))\b/i,
      /\b(?:UserCompany|CompanyUser|CompanyMember|WorkspaceMember|WorkspaceUser)\b/,
    ],
    10,
  );
  const companyAsTenant = companyMembership.length > 0
    ? await searchInFiles(ctx.root, sourceFiles, [/companyId/i, /company_id/i, /workspaceId/i, /workspace_id/i], 25)
    : [];

  const strongOrganization = [
    ...(await searchInFiles(ctx.root, sourceFiles, STRONG_TENANCY, 25)),
    ...teamAsTenant,
    ...companyAsTenant,
  ];
  const weakOrganization = await searchInFiles(ctx.root, sourceFiles, WEAK_TENANCY, 25);

  // A weak word never stands on its own, however many files it appears in. Bruno says
  // `workspaceId` in three — it has workspaces, and they are local folders, not
  // customers. A tenant boundary is named somewhere by a word that means only that.
  const organizationSignals = strongOrganization.length > 0
    ? [...strongOrganization, ...weakOrganization]
    : [];

  /**
   * `memberId` is a weak word, by this detector's own rule.
   *
   * It was strong enough to stand alone, and `ScopedMemberId` — a symbol table in a
   * compiler — was read as a tenant membership. "Member" means a struct field in most
   * languages and a person in a few; only a tenant word says which. The comment above
   * already states the principle: a weak word never stands on its own, however many
   * files it appears in.
   */
  const strongMembership = [
    ...(await searchInFiles(ctx.root, sourceFiles, STRONG_TENANCY, 25)),
    ...teamAsTenant,
    ...companyAsTenant,
  ];
  const weakMembership = await searchInFiles(ctx.root, sourceFiles, [/memberId/i, ...WEAK_TENANCY], 25);

  const membershipSignals = strongMembership.length > 0 ? [...strongMembership, ...weakMembership] : [];
  const b2bSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /stripe/i,
      /subscription/i,
      /\/admin/i,
      /\/users/i,
      /organizationId/i,
      /tenantId/i,
      /workspaceId/i,
      /teamId/i,
      /companyId/i,
    ],
    20
  );

  /**
   * Where a value from one of those packages is actually used.
   *
   * The dependency says the project installed something that authenticates; this says
   * where it does it, on a line the reader can open. It is also what makes the route
   * names irrelevant: `argon2.verify(...)` inside `/accedi` is the same evidence as
   * inside `/login`, and the binding is what finds it either way.
   */
  const boundAuthUses = await readPackageValueUses(ctx.root, sourceFiles, AUTH_PACKAGES);
  const authUseEvidence: DetectorEvidence[] = (boundAuthUses ?? []).slice(0, 6).map((use) => ({
    type: 'file' as const,
    value: 'an authentication package is used here',
    file: use.file,
    line: use.line,
  }));

  /**
   * The same question asked of the shape rather than of the vocabulary.
   *
   * This capability is the one with no package to anchor on — there is no
   * `npm install authorization` — so every reading of it was a list of the words
   * people happen to use. An Italian application guarding every route with
   * `if (nota.proprietario !== richiesta.utente.id)` was told it had no per-record
   * checks, under a recommendation to add what it already had.
   *
   * Express supplies the anchor it lacks: a router comes from the package, `.get(path,
   * handler)` is the framework saying "this is a request handler", and the handler's
   * first parameter is the request whatever its author called it. The rest is
   * structure and needs no vocabulary at all.
   */
  /**
   * Hashing a password is authentication, whatever the manifest says.
   *
   * `auth.core` rested on three things: a package on a list, a route named in English,
   * or a platform identity service. `gotify/server` has none of them — its Go module
   * requires `golang.org/x/crypto`, which is not an auth package but a hundred
   * different ones, and its routes are `/client`, `/application` and `/message`. It was
   * reported as having nothing to sign in to, and the profile that follows from that
   * was `client-app`: a notification server with users, tokens and a database, judged
   * as a program somebody installs.
   *
   * What it does have is `bcrypt.GenerateFromPassword` and
   * `bcrypt.CompareHashAndPassword` in `auth/password/password.go`. Those names belong
   * to the library, not to gotify, and the same is true of every entry below:
   * `password_hash` and `password_verify` are PHP's own, `has_secure_password` is
   * Rails', `BCryptPasswordEncoder` is Spring Security's, `PasswordHasher<T>` is
   * ASP.NET's, `make_password` and `check_password` are Django's.
   *
   * A program that hashes a password has somebody to sign in. There is no other reason
   * to call these.
   */
  const passwordHashing = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /\bbcrypt\.(GenerateFromPassword|CompareHashAndPassword)\b/,
      /golang\.org\/x\/crypto\/(bcrypt|argon2|scrypt|pbkdf2)/,
      /\bargon2\.IDKey\b|\bscrypt\.Key\(/,
      /\bpassword_hash\s*\(|\bpassword_verify\s*\(/,
      /\bhas_secure_password\b|\bBCrypt::Password\b/,
      /\bBCryptPasswordEncoder\b|\bPasswordEncoder\b/,
      /\bPasswordHasher\s*<|\bRfc2898DeriveBytes\b/,
      /**
       * Java's PBKDF2, named by the platform's algorithm registry.
       *
       * `traccar/traccar` hashes passwords in its own `Hashing` class through
       * `SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")`, with no Spring Security and
       * no bcrypt library, and read as a client application with nobody to sign in.
       * `PBKDF2WithHmacSHA256` is a standard JCA algorithm name — the same function .NET
       * calls `Rfc2898DeriveBytes`, one line up.
       */
      /\bPBKDF2WithHmacSHA\d+\b/,
      /\bmake_password\s*\(|\bcheck_password(_hash)?\s*\(/,
    ],
    10,
  );

  const structuralOwnership = await readOwnershipChecks(ctx.root, sourceFiles);
  const ownershipUnasked =
    wentUnasked(structuralOwnership, sourceFiles) && (await anyFileImportsExpress(ctx.root, sourceFiles));

  const hasAuth = authDeps.length > 0
    || routeSignals.length > 0
    || platformIdentity.length > 0
    || passwordHashing.length > 0;
  const hasAuthz = permissionSignals.length > 0 || roleSignals.length > 0;
  const b2bHint = b2bSignals.length > 0;
  const hasOrganization = organizationSignals.length > 0;

  return [
    {
      key: 'auth.core',
      present: hasAuth,
      complete: hasAuth && hasAuthz,
      evidence: evidenceOrSearch([...depEvidence(authDeps), ...authUseEvidence, ...snippetEvidence(routeSignals), ...snippetEvidence(platformIdentity)], 'a way for somebody to sign in', ['next-auth', 'passport', 'lucia', '@clerk/', '@supabase/auth', 'django.contrib.auth', 'devise', 'jsonwebtoken', 'a /login or /signin route', 'signIn(', 'authenticate(', 'a Cloudflare Access, Google IAP, AWS ALB or Azure Easy Auth identity header']),
      details: {
        hasAuth,
        hasAuthz,
      },
    },
    {
      // True when authentication goes exclusively through an external identity
      // provider and the repository stores no password of its own. Downstream this
      // makes password reset not applicable rather than missing — there is no
      // password to reset.
      key: 'auth.externalIdentityOnly',
      /**
       * Read from npm alone, so only a JavaScript project could ever reach it.
       *
       * crates.io authenticates through GitHub and nothing else: `oauth2` in its
       * Cargo.toml, no password-hashing crate anywhere, no reset route. It was told
       * at `high` to build a password reset flow for passwords it does not have.
       *
       * The disqualifying half matters more than the qualifying one, so it is the
       * wider of the two: anything that hashes a password, in any of these
       * ecosystems, means there is a password to reset. Django is on that list as
       * itself — `django-allauth` sits on top of Django's own user model, and those
       * projects can almost always reset a password.
       */
      present:
        externalIdentityProviders.length > 0 &&
        storesAPasswordItself.length === 0 &&
        passwordResetSignals.length === 0 &&
        passwordResetFiles.length === 0,
      evidence: depEvidence(externalIdentityProviders),
      details: { managedProviders: externalIdentityProviders.length },
    },
    {
      key: 'auth.2fa',
      present: twoFaDeps.length > 0 || twoFaSignals.length > 0,
      evidence: evidenceOrSearch([...depEvidence(twoFaDeps), ...snippetEvidence(twoFaSignals)], 'a second factor', ['otplib', 'speakeasy', 'notp', 'pyotp', 'django-otp', 'totp', 'authenticator app', 'webauthn', '@simplewebauthn']),
    },
    {
      key: 'auth.apiKeys',
      present: apiKeySignals.length > 0,
      evidence: evidenceOrSearch(snippetEvidence(apiKeySignals), 'keys this product issues and checks', ['x-api-key', 'api_keys.find', 'api_keys.where', 'hashedApiKey', 'token scope']),
    },
    {
      /**
       * Whether this project's routes are in a language these patterns can read.
       *
       * A gestionale with `/accedi`, `/recupero-password` and `/conferma-email` —
       * bcrypt, jsonwebtoken, the whole flow present — was told at `high` that it has
       * no password reset and no erasure. The searches look for "forgot password",
       * "password_reset" and "reset token", and `recuperoPassword` is none of those.
       * Adding the Italian words would fix Italian and leave Japanese, Spanish and
       * every other language exactly where they were, which is the guessing this
       * analyzer exists to stop.
       *
       * What can be known is whether we ever read a route name at all. `routeSignals`
       * matches `/login`, `/register`, `/signin` and their relatives; where a project
       * authenticates — proved by a hashing package, which is not a word anybody
       * chose — and *none* of those ever matched, its routes are named in something
       * else. The reset search never had a chance, and the difference between "you
       * have no reset" and "we could not read your routes" is the whole difference
       * between a finding and a guess.
       *
       * A framework that supplies the flow is checked before this: Django's
       * `auth.urls`, Devise and `Auth::routes(` are read whatever the routes around
       * them are called.
       */
      key: 'auth.routesAreReadable',
      present: routeSignals.length > 0,
      evidence: routeSignals.length > 0
        ? snippetEvidence(routeSignals.slice(0, 3))
        : searchedFor('a route named in English', ['/login', '/register', '/signin', '/signup', '/logout']),
    },
    {
      key: 'auth.passwordReset',
      present: passwordResetSignals.length > 0 || passwordResetFiles.length > 0,
      // The terms, where nothing matched. "No direct evidence captured" reads like
      // "we did not look"; this lets a reader whose flow is called `recoverAccess`
      // see in one line why it was missed.
      evidence: passwordResetSignals.length > 0 || passwordResetFiles.length > 0
        ? [...snippetEvidence(passwordResetSignals), ...fileNameEvidence(passwordResetFiles)]
        : searchedFor('a password reset flow', ['"forgot password"', 'password_reset', 'password-reset', '"reset token"', '"password recovery"', 'django.contrib.auth.urls', 'PasswordResetView', 'devise_for', 'Auth::routes(', 'a file named for password reset or recovery']),
    },
    {
      key: 'auth.emailVerification',
      present: emailVerificationSignals.length > 0,
      evidence: emailVerificationSignals.length > 0
        ? snippetEvidence(emailVerificationSignals)
        : searchedFor('email verification', ['"verify email"', 'email_verification', 'email-verification', '"confirm email"', 'isEmailVerified']),
    },
    {
      key: 'auth.sessionStrategy',
      present: sessionDeps.length > 0 || sessionSignals.length > 0,
      evidence: [...depEvidence(sessionDeps), ...snippetEvidence(sessionSignals)],
    },
    {
      key: 'authz.roles',
      present: roleSignals.length > 0,
      evidence: evidenceOrSearch(snippetEvidence(roleSignals), 'role checks', ['role ===', 'hasRole', 'isAdmin', 'user.role', 'roles.includes', '@Roles', 'role_required', '@PreAuthorize', '@Secured', 'GrantedAuthority', 'hasAuthority(', 'hasAnyRole(']),
    },
    {
      key: 'authz.permissions',
      present: permissionSignals.length > 0,
      evidence: evidenceOrSearch(snippetEvidence(permissionSignals), 'permission checks', ['requirePermission', 'permission_classes', 'permissions.py', 'authorize(', 'can(']),
    },
    {
      key: 'authz.resourceLevel',
      // Route-level permission checks no longer stand in for per-record ones: with the
      // needles above narrowed, this clause could only reintroduce what they removed.
      present: resourceLevelSignals.length > 0 || (structuralOwnership ?? []).length > 0,
      /**
       * The capability with no package to anchor on, read entirely from structure.
       *
       * Without the optional compiler the Express route walk does not happen, and the
       * only thing left is the vocabulary this detector was written to stop relying on.
       * `proprieta-in-italiano` turns from `passed` into a false `missing` — a
       * recommendation to add a check the code already has.
       */
      unanswered: ownershipUnasked && resourceLevelSignals.length === 0,
      evidence: evidenceOrSearch(
        [
          ...snippetEvidence(resourceLevelSignals),
          ...(structuralOwnership ?? []).slice(0, 6).map((check) => ({
            type: 'snippet' as const,
            value: check.snippet,
            file: check.file,
            line: check.line,
          })),
        ],
        'a check that the row belongs to the caller', ['requirePermission', 'permission_classes', 'authorize(', 'canAccess(', 'hasAccessTo(', 'ownerId', 'createdBy', 'req.user.id', 'userId ===']),
    },
    {
      key: 'tenancy.organization',
      present: hasOrganization,
      evidence: evidenceOrSearch(snippetEvidence(organizationSignals), 'a tenant of its own', ['organizationId', 'organization_id', 'tenantId', 'tenant_id', 'workspaceId', 'accountId']),
      details: {
        b2bHint,
        missingTenantRisk: b2bHint && !hasOrganization,
      },
    },
    {
      key: 'tenancy.membership',
      present: membershipSignals.length > 0,
      evidence: evidenceOrSearch(snippetEvidence(membershipSignals), 'a membership joining a person to a tenant', ['membership', 'organizationMember', 'teamMember', 'workspaceMember', 'memberId with a tenant word beside it']),
    },
  ];
}
