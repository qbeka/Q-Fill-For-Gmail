/**
 * Generates _locales/<lang>/messages.json from _locales/en/messages.json
 * Run: node scripts/generate-locales.mjs
 */
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enPath = path.join(root, '_locales/en/messages.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

/** @type {Record<string, Record<string, string>>} */
const translations = {
  es: {
    extensionName: 'Q-Fill para Gmail',
    extensionDescription: 'Extrae códigos de verificación de Gmail y los rellena en formularios. Todo se procesa en tu dispositivo.',
    statusConnected: 'Conectado',
    statusDisconnected: 'Desconectado',
    connectGmail: 'Conectar con Gmail',
    disconnect: 'Desconectar',
    checkEmails: 'Buscar correos ahora',
    checking: 'Buscando...',
    connecting: 'Conectando...',
    disconnecting: 'Desconectando...'
  },
  de: {
    extensionName: 'Q-Fill für Gmail',
    extensionDescription: 'Liest Bestätigungscodes aus Gmail und füllt Webformulare aus. Alles lokal auf Ihrem Gerät.',
    statusConnected: 'Verbunden',
    statusDisconnected: 'Getrennt',
    connectGmail: 'Mit Gmail verbinden',
    disconnect: 'Trennen',
    checkEmails: 'E-Mails prüfen'
  },
  fr: {
    extensionName: 'Q-Fill pour Gmail',
    extensionDescription: 'Extrait les codes de vérification de Gmail et remplit les formulaires. Traitement local uniquement.',
    statusConnected: 'Connecté',
    statusDisconnected: 'Déconnecté',
    connectGmail: 'Connecter Gmail',
    disconnect: 'Déconnecter',
    checkEmails: 'Vérifier les e-mails'
  },
  pt_BR: {
    extensionName: 'Q-Fill para Gmail',
    extensionDescription: 'Extrai códigos de verificação do Gmail e preenche formulários. Processamento local.',
    statusConnected: 'Conectado',
    statusDisconnected: 'Desconectado',
    connectGmail: 'Conectar ao Gmail',
    checkEmails: 'Verificar e-mails'
  },
  zh_CN: {
    extensionName: 'Q-Fill Gmail 填码',
    extensionDescription: '从 Gmail 提取验证码并填入网页表单，全部在本地处理。',
    statusConnected: '已连接',
    statusDisconnected: '未连接',
    connectGmail: '连接 Gmail',
    checkEmails: '立即检查邮件'
  },
  zh_TW: {
    extensionName: 'Q-Fill Gmail 填碼',
    extensionDescription: '從 Gmail 擷取驗證碼並填入網頁表單，全部在本機處理。',
    statusConnected: '已連線',
    statusDisconnected: '未連線',
    connectGmail: '連線 Gmail',
    checkEmails: '立即檢查郵件'
  },
  ja: {
    extensionName: 'Q-Fill for Gmail',
    extensionDescription: 'Gmailから認証コードを取得しフォームに入力します。処理はすべて端末内で完結します。',
    statusConnected: '接続済み',
    connectGmail: 'Gmailに接続',
    checkEmails: 'メールを確認'
  },
  ko: {
    extensionName: 'Q-Fill for Gmail',
    extensionDescription: 'Gmail에서 인증 코드를 가져와 양식에 입력합니다. 모든 처리는 기기에서만 이루어집니다.',
    statusConnected: '연결됨',
    connectGmail: 'Gmail 연결',
    checkEmails: '이메일 확인'
  },
  hi: {
    extensionName: 'Q-Fill for Gmail',
    extensionDescription: 'Gmail से सत्यापन कोड निकालकर फ़ॉर्म भरता है। सब कुछ आपके डिवाइस पर।',
    connectGmail: 'Gmail कनेक्ट करें',
    checkEmails: 'ईमेल जाँचें'
  },
  ar: {
    extensionName: 'Q-Fill لـ Gmail',
    extensionDescription: 'يستخرج رموز التحقق من Gmail ويملأ النماذج. كل المعالجة محلية على جهازك.',
    connectGmail: 'ربط Gmail',
    checkEmails: 'فحص البريد'
  },
  ru: {
    extensionName: 'Q-Fill для Gmail',
    extensionDescription: 'Извлекает коды подтверждения из Gmail и заполняет формы. Обработка только на устройстве.',
    connectGmail: 'Подключить Gmail',
    checkEmails: 'Проверить почту'
  },
  it: {
    extensionName: 'Q-Fill per Gmail',
    extensionDescription: 'Estrae codici di verifica da Gmail e compila i moduli. Tutto in locale.',
    connectGmail: 'Connetti Gmail',
    checkEmails: 'Controlla email'
  },
  tr: {
    extensionName: 'Q-Fill for Gmail',
    extensionDescription: 'Gmail\'den doğrulama kodlarını alır ve formlara doldurur. İşlem cihazınızda kalır.',
    connectGmail: 'Gmail\'e bağlan',
    checkEmails: 'E-postaları kontrol et'
  },
  vi: {
    extensionName: 'Q-Fill cho Gmail',
    extensionDescription: 'Lấy mã xác minh từ Gmail và điền vào biểu mẫu. Xử lý hoàn toàn trên thiết bị.',
    connectGmail: 'Kết nối Gmail',
    checkEmails: 'Kiểm tra email'
  },
  id: {
    extensionName: 'Q-Fill untuk Gmail',
    extensionDescription: 'Mengambil kode verifikasi dari Gmail dan mengisi formulir. Semua diproses secara lokal.',
    connectGmail: 'Hubungkan Gmail',
    checkEmails: 'Periksa email'
  },
  pl: {
    extensionName: 'Q-Fill dla Gmail',
    extensionDescription: 'Pobiera kody weryfikacyjne z Gmail i wypełnia formularze. Przetwarzanie lokalne.',
    connectGmail: 'Połącz z Gmail',
    checkEmails: 'Sprawdź e-maile'
  },
  nl: {
    extensionName: 'Q-Fill voor Gmail',
    extensionDescription: 'Haalt verificatiecodes uit Gmail en vult formulieren in. Alles lokaal verwerkt.',
    connectGmail: 'Verbinden met Gmail',
    checkEmails: 'E-mails controleren'
  },
  th: {
    extensionName: 'Q-Fill สำหรับ Gmail',
    extensionDescription: 'ดึงรหัสยืนยันจาก Gmail และกรอกในฟอร์ม ประมวลผลบนอุปกรณ์ของคุณเท่านั้น',
    connectGmail: 'เชื่อมต่อ Gmail',
    checkEmails: 'ตรวจสอบอีเมล'
  },
  bn: {
    extensionName: 'Q-Fill for Gmail',
    extensionDescription: 'Gmail থেকে যাচাইকরণ কোড নিয়ে ফর্ম পূরণ করে। সব প্রক্রিয়া স্থানীয়।',
    connectGmail: 'Gmail সংযুক্ত করুন',
    checkEmails: 'ইমেইল পরীক্ষা করুন'
  },
  uk: {
    extensionName: 'Q-Fill для Gmail',
    extensionDescription: 'Витягує коди підтвердження з Gmail і заповнює форми. Обробка лише на пристрої.',
    connectGmail: 'Підключити Gmail',
    checkEmails: 'Перевірити пошту'
  }
};

const locales = Object.keys(translations);

for (const locale of locales) {
  const out = {};
  for (const [key, meta] of Object.entries(en)) {
    out[key] = {
      ...meta,
      message: translations[locale][key] ?? meta.message
    };
  }
  const dir = path.join(root, '_locales', locale);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'messages.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log('Wrote', locale);
}

console.log(`Done. ${locales.length} locales (+ en default).`);
