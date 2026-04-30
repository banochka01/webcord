const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [
  'node_modules/@capacitor/android/capacitor/build.gradle',
  'node_modules/@capacitor/keyboard/android/build.gradle',
  'node_modules/@capacitor/splash-screen/android/build.gradle',
  'node_modules/@capacitor/status-bar/android/build.gradle',
  'android/capacitor-cordova-android-plugins/build.gradle',
  'android/app/capacitor.build.gradle'
];

const mirrorBlock = [
  "        maven { url 'https://maven.aliyun.com/repository/google' }",
  "        maven { url 'https://maven.aliyun.com/repository/central' }",
  "        maven { url 'https://maven.aliyun.com/repository/public' }"
].join('\n');

for (const relativePath of files) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/com\.android\.tools\.build:gradle:8\.13\.0/g, 'com.android.tools.build:gradle:8.11.0');
  content = content.replace(/JavaVersion\.VERSION_21/g, 'JavaVersion.VERSION_17');
  content = content.replace(/buildscript\s*\{\s*repositories\s*\{/g, (match) => {
    if (content.includes("maven.aliyun.com/repository/google")) return match;
    return `${match}\n${mirrorBlock}`;
  });
  fs.writeFileSync(file, content);
  console.log(`patched ${relativePath}`);
}
