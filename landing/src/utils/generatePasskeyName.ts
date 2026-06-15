import { UAParser } from 'ua-parser-js';

export const generatePasskeyName = async (): Promise<string> => {
  const parser = new UAParser();
  const device = parser.getDevice().model || parser.getOS().name || 'Unknown Device';
  const browser = parser.getBrowser().name || 'Unknown Browser';

  let city = '';
  try {
    const locationRes = await Promise.race([
      fetch('https://ipapi.co/json/'),
      new Promise((_, reject) => setTimeout(() => reject('timeout'), 1200))
    ]);
    const location = await (locationRes as Response).json();
    city = location.city || '';
  } catch (e) {
    city = '';
  }

  // Add small delay to ensure promise settles before WebAuthn triggers
  await new Promise((resolve) => setTimeout(resolve, 200));

  const finalName = `${device}, ${browser}${city ? ', ' + city : ''}`;
  console.log('Final device name:', finalName);
  return finalName;
};