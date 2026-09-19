import type { DetectorEvidence, DetectorResult } from './types';
import { hasAnyDartDep, hasAnyDep, hasAnyGradleDep, hasAnySwiftDep, type DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { searchInFiles } from '../utils/textSearch';

/**
 * Whether this is an application that ships to somebody else's phone, and what that
 * demands of it.
 *
 * A mobile app lands today in `client-app`, which is the closest profile and
 * underestimates it: that profile asks that the user's work survives, that the bundle
 * arrives and that crashes are heard about, and asks nothing about the fact that the
 * code runs on a device its author does not own, behind a review process, on a network
 * that comes and goes, in a version that may still be installed in a year.
 *
 * Five expectations, none of which a web application has:
 *
 * **Permissions asked in context.** A camera prompt on first launch is rejected by the
 * stores before it is rejected by users. The signal is not the permission — every app
 * declares some — it is whether each declared permission has a purpose string next to
 * it, which is the thing a reviewer reads.
 *
 * **Credentials in the keychain.** On a phone the file system is not a security
 * boundary: anything in preferences or a plain file is readable on a rooted device and
 * often in a backup. Tokens belong in Keychain or Keystore.
 *
 * **Working offline.** A network that comes and goes is the normal state, not an error
 * case. An app that renders a spinner in a lift is broken in a way its author never
 * sees on a desk.
 *
 * **Forced updates.** The old client stays installed for months whatever the release
 * notes say, so the API either keeps supporting it or can tell it to stop.
 *
 * **A privacy declaration.** The App Store and Play listings are a public, checkable
 * commitment, and it is common for them not to match what the code does.
 */

/** Files that say which platform this is, without reading their contents. */
const IOS_MARKERS = [/(^|\/)Info\.plist$/i, /(^|\/)Podfile$/, /\.xcodeproj\//, /(^|\/)Package\.swift$/];
/**
 * `AndroidManifest.xml` says Android. `build.gradle` says the JVM.
 *
 * Gradle builds Android applications, Spring services, Kotlin libraries and most of the
 * Java world. Treating its presence as a platform made spring-petclinic — the canonical
 * Spring web application — a mobile app at high confidence, and it would do the same to
 * every JVM server ever written.
 *
 * A Gradle file earns the label by applying the Android plugin, which is the line that
 * makes a build an Android build. That has to be read rather than matched on a path,
 * which is why the two lists are separate.
 */
const ANDROID_MARKERS = [/(^|\/)AndroidManifest\.xml$/i];
const GRADLE_FILES = /(^|\/)build\.gradle(\.kts)?$/;
const ANDROID_GRADLE_PLUGIN = /com\.android\.(application|library)|(^|\s)android\s*\{/m;

/** Gradle coordinates that put a secret in the Android keystore rather than in a file. */
const SECURE_STORAGE_GRADLE = ['androidx.security:security-crypto', 'com.scottyab:secure-preferences'];

/**
 * Swift keychain wrappers, named both ways.
 *
 * Swift Package Manager identifies a dependency as `owner/repo` and CocoaPods as a
 * bare pod name, so the same library arrives under two spellings and a list holding
 * only one of them finds it only half the time — which is how a Podfile declaring
 * KeychainAccess came back as "no secure storage".
 */
const SECURE_STORAGE_SWIFT = [
  'kishikawakatsumi/keychainaccess',
  'keychainaccess',
  'evgenyneu/keychain-swift',
  'keychainswift',
  'square/valet',
  'valet',
];

/** Local databases, by platform, that let an app open without a network. */
const OFFLINE_GRADLE = ['androidx.room', 'io.realm', 'io.objectbox', 'com.squareup.sqldelight', 'app.cash.sqldelight'];
const OFFLINE_SWIFT = [
  'groue/grdb.swift',
  'grdb.swift',
  'stephencelis/sqlite.swift',
  'sqlite.swift',
  'realm/realm-swift',
  'realm/realm-cocoa',
  'realmswift',
];

/** Dependencies that put a secret somewhere the operating system protects. */
const SECURE_STORAGE_DEPS = [
  'flutter_secure_storage',
  'react-native-keychain',
  'expo-secure-store',
  'react-native-encrypted-storage',
  '@capacitor/preferences',
  'capacitor-secure-storage-plugin',
];

/** Dependencies whose whole purpose is that the app works with no network. */
const OFFLINE_DEPS = [
  'sqflite',
  'drift',
  'hive',
  'isar',
  'objectbox',
  'realm',
  'watermelondb',
  '@nozbe/watermelondb',
  'react-native-mmkv',
  '@react-native-async-storage/async-storage',
  'redux-persist',
  '@tanstack/query-persist-client-core',
  'powersync',
];

/**
 * Paths that contain a platform marker without being a project.
 *
 * Every macOS `.bundle`, `.framework`, `.app` and `.dSYM` carries an `Info.plist` by
 * definition, and build caches are full of them. A Unity game was classified as an iOS
 * application on the strength of
 * `Library/BurstCache/JIT/…bundle.dSYM/Contents/Info.plist` — a debug-symbols bundle
 * inside generated output, in a repository whose own engine had already been detected.
 *
 * `Pods`, `DerivedData` and `node_modules` are here for the same reason: they hold
 * other people's projects, and finding one there says nothing about this one.
 */
const GENERATED_OR_VENDORED = /(^|\/)(Library|Pods|DerivedData|build|node_modules|dist|out|\.gradle)(\/|$)|\.(bundle|framework|app|dSYM|xcframework)\//i;

function matchesAny(files: string[], patterns: RegExp[]): string[] {
  return files
    .filter((file) => !GENERATED_OR_VENDORED.test(file))
    .filter((file) => patterns.some((pattern) => pattern.test(file)));
}

async function androidGradleFiles(ctx: DetectContext): Promise<string[]> {
  const found: string[] = [];

  for (const file of ctx.files.all.filter((candidate) => GRADLE_FILES.test(candidate))) {
    const text = await readTextFileSafe(ctx.root, file);
    if (text && ANDROID_GRADLE_PLUGIN.test(text)) found.push(file);
  }

  return found;
}

export async function detectMobile(ctx: DetectContext): Promise<DetectorResult[]> {
  const iosFiles = matchesAny(ctx.files.all, IOS_MARKERS);
  const androidFiles = [...matchesAny(ctx.files.all, ANDROID_MARKERS), ...(await androidGradleFiles(ctx))];
  const flutterDeps = hasAnyDartDep(ctx, ['flutter']);
  const reactNativeDeps = hasAnyDep(ctx, ['react-native', 'expo']);

  const platforms: string[] = [];
  const platformEvidence: DetectorEvidence[] = [];

  if (flutterDeps.length) {
    platforms.push('flutter');
    platformEvidence.push({ type: 'dependency', value: 'flutter' });
  }
  if (reactNativeDeps.length) {
    platforms.push('react-native');
    for (const dep of reactNativeDeps) platformEvidence.push({ type: 'dependency', value: dep });
  }
  if (iosFiles.length) {
    platforms.push('ios');
    platformEvidence.push({ type: 'file', value: iosFiles[0], file: iosFiles[0] });
  }
  if (androidFiles.length) {
    platforms.push('android');
    platformEvidence.push({ type: 'file', value: androidFiles[0], file: androidFiles[0] });
  }

  const isMobile = platforms.length > 0;

  /**
   * Every capability below reports `present: false` when this is not a mobile project,
   * with no evidence — the profile that asks about them is the only one that applies
   * them, and a web repository being told it has no Keychain usage would be noise.
   */
  if (!isMobile) {
    return [
      { key: 'mobile.platform', present: false, evidence: [] },
      { key: 'mobile.permissions', present: false, evidence: [] },
      { key: 'mobile.credentialStorage', present: false, evidence: [] },
      { key: 'mobile.offline', present: false, evidence: [] },
      { key: 'mobile.forcedUpdate', present: false, evidence: [] },
      { key: 'mobile.privacyDeclaration', present: false, evidence: [] },
    ];
  }

  // Permissions: declared is not the question, explained is.
  const permissionEvidence: DetectorEvidence[] = [];
  let permissionsExplained = false;

  for (const file of iosFiles.filter((f) => /Info\.plist$/i.test(f))) {
    const text = (await readTextFileSafe(ctx.root, file)) ?? '';

    // Apple's convention: every permission key has a matching UsageDescription whose
    // value is shown to the person being asked. An empty one passes the compiler and
    // fails review.
    const usageKeys = [...text.matchAll(/<key>(NS\w*UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)];
    const explained = usageKeys.filter(([, , reason]) => reason.trim().length > 0);

    if (explained.length) {
      permissionsExplained = true;
      permissionEvidence.push({
        type: 'file',
        value: `${explained.length} permission${explained.length === 1 ? '' : 's'} with a reason in ${file}`,
        file,
      });
    } else if (usageKeys.length) {
      permissionEvidence.push({
        type: 'file',
        value: `permissions declared with an empty reason in ${file}`,
        file,
      });
    }
  }

  for (const file of androidFiles.filter((f) => /AndroidManifest\.xml$/i.test(f))) {
    const text = (await readTextFileSafe(ctx.root, file)) ?? '';
    const declared = [...text.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map(([, name]) => name);

    // Android has no purpose strings, so the equivalent evidence is asking at the
    // moment of use: a runtime request in the code rather than only a manifest entry.
    if (declared.length) {
      permissionEvidence.push({
        type: 'file',
        value: `${declared.length} permission${declared.length === 1 ? '' : 's'} declared in ${file}`,
        file,
      });
    }
  }

  const runtimeRequests = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /requestPermissions?\(/,
      /ActivityCompat\.requestPermissions/,
      /shouldShowRequestPermissionRationale/,
      /Permission\.\w+\.request\(/,
      /request\(\)\s*;?\s*\/\/\s*permission/,
      /PermissionsAndroid\.request/,
      /requestPermissionsAsync/,
    ],
    3,
  );

  for (const match of runtimeRequests) {
    permissionsExplained = true;
    permissionEvidence.push({ type: 'snippet', value: match.snippet, file: match.file, line: match.line });
  }

  const secureStorage = hasAnyDep(ctx, SECURE_STORAGE_DEPS);
  const secureStorageDart = hasAnyDartDep(ctx, ['flutter_secure_storage']);
  const secureStorageNative = [
    ...hasAnyGradleDep(ctx, SECURE_STORAGE_GRADLE),
    ...hasAnySwiftDep(ctx, SECURE_STORAGE_SWIFT),
  ];
  const keychainInSource = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/KeychainAccess/, /kSecClass/, /EncryptedSharedPreferences/, /AndroidKeyStore/, /SecItemAdd/],
    3,
  );

  const credentialEvidence: DetectorEvidence[] = [
    ...[...secureStorage, ...secureStorageDart, ...secureStorageNative].map<DetectorEvidence>((dep) => ({
      type: 'dependency',
      value: dep,
    })),
    ...keychainInSource.map<DetectorEvidence>((match) => ({
      type: 'snippet',
      value: match.snippet,
      file: match.file,
      line: match.line,
    })),
  ];

  const offlineDeps = [
    ...hasAnyDep(ctx, OFFLINE_DEPS),
    ...hasAnyDartDep(ctx, OFFLINE_DEPS),
    ...hasAnyGradleDep(ctx, OFFLINE_GRADLE),
    ...hasAnySwiftDep(ctx, OFFLINE_SWIFT),
  ];

  /**
   * A local database is the strong signal; knowing the network dropped is the weak
   * one. Both are recorded, because an app that stores nothing but tells the user the
   * connection is gone is a different thing from one that shows a spinner forever.
   */
  const connectivityChecks = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/Connectivity\(\)/, /connectivity_plus/, /NetInfo\./, /navigator\.onLine/, /NWPathMonitor/, /isReachable/],
    3,
  );

  const offlineEvidence: DetectorEvidence[] = [
    ...offlineDeps.map<DetectorEvidence>((dep) => ({ type: 'dependency', value: dep })),
    ...connectivityChecks.map<DetectorEvidence>((match) => ({
      type: 'snippet',
      value: match.snippet,
      file: match.file,
      line: match.line,
    })),
  ];

  const forcedUpdate = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /minimum_?[Vv]ersion/,
      /force_?[Uu]pdate/,
      /forceUpgrade/,
      /upgrader/i,
      /in_app_update/,
      /AppUpdateManager/,
      /minimumSupportedVersion/,
    ],
    3,
  );

  /**
   * The privacy declaration, which exists as a file in both worlds now: Apple's
   * PrivacyInfo.xcprivacy since 2024, and the data-safety declaration Play requires.
   * A repository with neither has made the commitment somewhere no reviewer of this
   * code can check it against the code.
   */
  const privacyFiles = ctx.files.all.filter((file) =>
    /(^|\/)(PrivacyInfo\.xcprivacy|privacy-manifest\.json|data_safety\.ya?ml)$/i.test(file),
  );

  return [
    {
      key: 'mobile.platform',
      present: true,
      evidence: platformEvidence,
      details: { platforms },
    },
    {
      key: 'mobile.permissions',
      // Declared-and-explained, or asked at the moment of use. A manifest full of
      // permissions with nothing next to them is the failing case, not the passing one.
      present: permissionsExplained,
      evidence: permissionEvidence,
    },
    { key: 'mobile.credentialStorage', present: credentialEvidence.length > 0, evidence: credentialEvidence },
    { key: 'mobile.offline', present: offlineDeps.length > 0, evidence: offlineEvidence },
    {
      key: 'mobile.forcedUpdate',
      present: forcedUpdate.length > 0,
      evidence: forcedUpdate.map((match) => ({
        type: 'snippet' as const,
        value: match.snippet,
        file: match.file,
        line: match.line,
      })),
    },
    {
      key: 'mobile.privacyDeclaration',
      present: privacyFiles.length > 0,
      evidence: privacyFiles.map((file) => ({ type: 'file' as const, value: file, file })),
    },
  ];
}
