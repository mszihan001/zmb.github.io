const STORE = {
  products: 'jihan_products_v1', admins: 'jihan_admins_v1', memos: 'jihan_memos_v1',
  customers: 'jihan_customers_v1', settings: 'jihan_settings_v1', counter: 'jihan_memo_counter_v1'
};
const defaultProducts = ['রুই','মৃগেল','কাতলা','বাটা','সীলভার','গ্লাসকাপ','স্বরপুটি','পাঙ্গাস','হাংরি','দেশী মাগুর','কৈ','টেংরা','গুলশা','পাবদা'].map((name, i) => ({
  id: `fish-${i + 1}`, name, price: 0, description: 'উন্নতমানের রেনু পোনা', image: ''
}));
const defaultSettings = {
  heroTitle: 'সুস্থ পোনা, সমৃদ্ধ মাছ চাষ',
  heroText: 'আপনার পুকুরের জন্য বেছে নিন উন্নতমানের ও সতেজ মাছের রেনু পোনা। মানসম্মত পোনা ও আন্তরিক পরামর্শে আমরা আছি আপনার পাশে।',
  heroImage: '',
  adviceTitle: 'সঠিক পোনা বাছাই, সফল চাষের প্রথম ধাপ',
  adviceText: 'পুকুরের আকার, পানির অবস্থা ও চাষের উদ্দেশ্য অনুযায়ী পোনা নির্বাচন করুন। পোনা ছাড়ার আগে পুকুর প্রস্তুত রাখুন এবং পরিবহনের পর ধীরে ধীরে পানির সঙ্গে মানিয়ে নিন। পরামর্শের জন্য আমাদের সাথে কথা বলুন।',
  gallery: ['', '', '']
};
const read = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
};
let firebaseReady = false;
const save = (key, value) => {
  const serialized = JSON.stringify(value);
  localStorage.setItem(key, serialized);
  if (firebaseReady && window.firebaseDatabase) {
    window.firebaseDatabase.ref(`websiteData/${key}`).set(value).catch(error => {
      console.error('Firebase save failed:', error);
      toast('Firebase-এ তথ্য সংরক্ষণ হয়নি। Database Rules পরীক্ষা করুন।');
    });
  }
};
let products = read(STORE.products, defaultProducts);
let admins = read(STORE.admins, [{ name: 'প্রধান অ্যাডমিন', user: 'admin', pass: 'admin' }]);
if (!Array.isArray(admins)) admins = [];
if (!admins.some(admin => admin && String(admin.user).trim().toLowerCase() === 'admin' && String(admin.pass) === 'admin')) {
  admins.unshift({ name: 'প্রধান অ্যাডমিন', user: 'admin', pass: 'admin' });
  save(STORE.admins, admins);
}
let memos = read(STORE.memos, []);
let customers = read(STORE.customers, {});
let settings = { ...defaultSettings, ...read(STORE.settings, {}) };
settings.heroSlides = (Array.isArray(settings.heroSlides) ? settings.heroSlides : [settings.heroImage, '', '', '', '', '', '']).slice(0, 7);
while (settings.heroSlides.length < 7) settings.heroSlides.push('');
let selectedItems = [];
let pendingMemo = null;
let lastSavedMemoId = null;
let activeAdmin = null;
let pendingPublicPaymentMemoId = null;
let editingMemoId = null;
const legacyLanguage = localStorage.getItem('jihan_language');
let siteLanguage = localStorage.getItem('jihan_site_language') || settings.language || legacyLanguage || 'bn';
let adminPanelLanguage = localStorage.getItem('jihan_admin_language') || 'bn';
function startFirebaseSync() {
  const database = window.firebaseDatabase;
  if (!database) return;

  const ref = database.ref('websiteData');
  const localData = () => ({
    [STORE.products]: products,
    [STORE.admins]: admins,
    [STORE.memos]: memos,
    [STORE.customers]: customers,
    [STORE.settings]: settings,
    [STORE.counter]: Number(localStorage.getItem(STORE.counter)) || nextMemoNumber()
  });

  ref.once('value').then(snapshot => {
    const remote = snapshot.val();
    if (!remote) {
      return ref.set(localData()).then(() => null);
    }
    const missing = {};
    Object.entries(localData()).forEach(([key, value]) => {
      if (!Object.prototype.hasOwnProperty.call(remote, key)) missing[key] = value;
    });
    return Object.keys(missing).length ? ref.update(missing).then(() => remote) : remote;
  }).then(initialData => {
    firebaseReady = true;
    ref.on('value', snapshot => {
      const data = snapshot.val();
      if (!data) return;
      if (Array.isArray(data[STORE.products])) products = data[STORE.products];
      if (Array.isArray(data[STORE.admins])) admins = data[STORE.admins];
      if (Array.isArray(data[STORE.memos])) memos = data[STORE.memos];
      if (data[STORE.customers] && typeof data[STORE.customers] === 'object') customers = data[STORE.customers];
      if (data[STORE.settings] && typeof data[STORE.settings] === 'object') {
        settings = { ...defaultSettings, ...data[STORE.settings] };
        settings.heroSlides = (Array.isArray(settings.heroSlides) ? settings.heroSlides : [settings.heroImage, '', '', '', '', '', '']).slice(0, 7);
        while (settings.heroSlides.length < 7) settings.heroSlides.push('');
      }
      if (data[STORE.counter] !== undefined) localStorage.setItem(STORE.counter, String(data[STORE.counter]));
      Object.entries(data).forEach(([key, value]) => {
        if (Object.values(STORE).includes(key)) localStorage.setItem(key, JSON.stringify(value));
      });
      renderHomepage();
      applyLanguage();
      if ($('adminModal').classList.contains('open') && !$('adminView').classList.contains('hidden')) {
        renderAdminProducts(); renderPicker(); renderAdminAccounts(); renderAdminWorkReport(); renderMemos(); renderCustomerInfo();
      }
      const searchedId = $('publicMemoId').value.trim();
      if (searchedId) publicMemoSearch(searchedId);
    }, error => {
      console.error('Firebase listener failed:', error);
      toast('Firebase থেকে তথ্য আনা যায়নি। Database Rules পরীক্ষা করুন।');
    });
  }).catch(error => {
    console.error('Firebase connection failed:', error);
    toast('Firebase সংযোগ হয়নি। Database Rules পরীক্ষা করুন।');
  });
}
setTimeout(startFirebaseSync, 0);
const ADMIN_PANELS = ['memoAdmin', 'memosAdmin', 'dueCustomersAdmin', 'productsAdmin', 'adminsAdmin', 'siteAdmin', 'customerInfoAdmin'];
const ADMIN_PERMISSIONS = [...ADMIN_PANELS, 'payMemos'];
const ADMIN_PANEL_LABELS = { memoAdmin: 'মেমো তৈরি', memosAdmin: 'মেমো সমূহ', dueCustomersAdmin: 'অপরিশোধ গ্রাহক', payMemos: 'মেমো পরিশোধের অনুমতি', productsAdmin: 'পণ্য নিয়ন্ত্রণ', adminsAdmin: 'অ্যাডমিন নিয়ন্ত্রণ', siteAdmin: 'সাইট সেটিংস', customerInfoAdmin: 'গ্রাহকের তথ্য' };
function adminPermissions(admin = activeAdmin) {
  return Array.isArray(admin?.permissions) ? admin.permissions.filter(permission => ADMIN_PERMISSIONS.includes(permission)) : ADMIN_PERMISSIONS;
}
function hasAdminAccess(...panels) {
  return !!activeAdmin && panels.some(panel => adminPermissions().includes(panel));
}
function applyAdminPermissions() {
  const allowed = adminPermissions();
  const can = permission => allowed.includes(permission);
  document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('hidden'));
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.remove('hidden'));
  const firstPanel = ADMIN_PANELS.find(panel => can(panel)) || ADMIN_PANELS[0];
  document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.panel === firstPanel));
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('active', panel.id === firstPanel));

  $('newProductButton').classList.toggle('hidden', !can('productsAdmin'));
  $('dueCustomersPrintButton').classList.toggle('hidden', !can('dueCustomersAdmin'));
  document.querySelector('.memo-builder').querySelectorAll('input, select, textarea, button').forEach(control => {
    if (control.id === 'saveMemoButton') {
      if (!can('memoAdmin')) control.disabled = true;
    } else control.disabled = !can('memoAdmin');
  });
  $('memoProductPicker').style.pointerEvents = can('memoAdmin') ? '' : 'none';
  $('memoProductPicker').style.opacity = can('memoAdmin') ? '' : '.65';
  ['productForm', 'adminCreateForm', 'siteSettingsForm'].forEach((id, index) => {
    const permission = ['productsAdmin', 'adminsAdmin', 'siteAdmin'][index];
    document.getElementById(id).querySelectorAll('input, select, textarea, button').forEach(control => {
      control.disabled = !can(permission);
    });
  });
}

const translations = {
  'ভাষা': 'Language', 'অ্যাডমিনের ভাষা': 'Admin Language',
  'জিহান মৎস্য বীজাগার | উন্নতমানের মাছের রেনু পোনা': 'Jihan Fish Hatchery | Quality Fish Fingerlings',
  'উন্নতমানের রেনু পোনা': 'High-quality fish fingerlings', 'ধরনের পোনা': 'types of fingerlings',
  'যেমন: 1001': 'e.g. 1001', 'মেমো নম্বর লিখুন': 'Enter memo number',
  'ছবি যোগ করতে অ্যাডমিন প্যানেলের সাইট সেটিংস ব্যবহার করুন।': 'Add images in Admin Panel → Site Settings.',
  'ছবিটি পড়া যায়নি। অন্য ছবি নির্বাচন করুন।': 'Could not read the image. Please choose another.',
  'পুকুরে মাছ': 'Fish in a pond', 'মৎস্য চাষ': 'Fish farming', 'বন্ধ করুন': 'Close',
  'কত কেজি নেবেন?': 'How many kilograms would you like?', 'প্রতি কেজি': 'per kg',
  'মুছে ফেললে এই মেমোর তথ্য আর ফিরিয়ে আনা যাবে না।': 'This memo cannot be recovered after deletion.',
  'হোমপেজ আপডেট হয়েছে।': 'Homepage updated.', 'পণ্য সংরক্ষণ হয়েছে।': 'Product saved.',
  'মেমোর জন্য অন্তত একটি পণ্য যোগ করুন।': 'Add at least one product to the memo.',
  'মেমো তৈরি হয়েছে।': 'Memo created.', 'মেমো তৈরি হয়েছে—প্রিভিউ দেখুন।': 'Memo preview is ready.', 'মেমো প্রিন্ট করুন': 'Print Memo', 'মেমো আগে তৈরি করুন।': 'Create the memo first.', 'মেমো সেভ হয়েছে।': 'Memo saved.', 'মেমো সেভ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।': 'Could not save the memo. Check browser storage.', 'বাকি টাকার মধ্যে সঠিক জমার পরিমাণ লিখুন।': 'Enter a valid amount within the remaining balance.',
  'এই নম্বরে কোনো মেমো পাওয়া যায়নি।': 'No memo found with this number.',
  'হোম': 'Home', '⌂ হোম': '⌂ Home', 'পণ্যের বিস্তারিত': 'Products', 'চাষের পরামর্শ': 'Farming Advice', 'মেমো সার্চ': 'Memo Search',
  'বগুড়ার বিশ্বস্ত মাছের পোনা সরবরাহকারী': 'Bogura’s trusted fish fingerling supplier',
  'সুস্থ পোনা, সমৃদ্ধ মাছ চাষ': 'Healthy fingerlings, successful fish farming',
  'আপনার পুকুরের জন্য বেছে নিন উন্নতমানের ও সতেজ মাছের রেনু পোনা। মানসম্মত পোনা ও আন্তরিক পরামর্শে আমরা আছি আপনার পাশে।': 'Choose high-quality, fresh fingerlings for your pond. We are here with quality fingerlings and friendly farming advice.',
  'পণ্য দেখুন': 'View Products', 'এখনই ফোন করুন': 'Call Now', 'যত্নসহকারে পোনা বাছাই': 'Carefully selected fingerlings', 'চাষে অভিজ্ঞ পরামর্শ': 'Expert farming advice',
  'বিশ্বাসের সাথে চাষ করুন': 'Farm with confidence', 'আপনার সাফল্যই আমাদের অঙ্গীকার': 'Your success is our promise', 'নির্বাচিত': 'Selected',
  'আমাদের ঠিকানা': 'Our Address', 'জগন্নাথপুর (হাজির বাজার), বগুড়া': 'Jagannathpur (Hazir Bazar), Bogura', 'পণ্যের নিশ্চয়তা': 'Product Quality', 'উন্নতমানের রেনু ও পোনা': 'High-quality fry and fingerlings', 'ফোনে যোগাযোগ': 'Contact by Phone',
  'আপনার পাশে আমরা': 'We are here for you', 'সঠিক পোনা বাছাই,': 'Choose the right fingerlings,', 'সফল চাষের প্রথম ধাপ': 'the first step to successful farming',
  'সঠিক পোনা বাছাই, সফল চাষের প্রথম ধাপ': 'Choosing the right fingerlings is the first step to successful farming',
  'পুকুরের আকার, পানির অবস্থা ও চাষের উদ্দেশ্য অনুযায়ী পোনা নির্বাচন করুন। পোনা ছাড়ার আগে পুকুর প্রস্তুত রাখুন এবং পরিবহনের পর ধীরে ধীরে পানির সঙ্গে মানিয়ে নিন। পরামর্শের জন্য আমাদের সাথে কথা বলুন।': 'Choose fingerlings according to your pond size, water conditions, and farming goals. Prepare the pond before stocking and gradually acclimatize the fingerlings after transport. Contact us for advice.',
  'পরামর্শ নিন': 'Get Advice', 'মৎস্য চাষের ছবি': 'Fish farming photos', 'আমাদের পণ্য': 'Our Products', 'আপনার পুকুরের জন্য সেরা পোনা': 'The best fingerlings for your pond',
  'সহজে খুঁজে নিন': 'Find it easily', 'আপনার মেমো দেখুন': 'Check Your Memo', 'মেমোর ক্রমিক নম্বর লিখে পেমেন্টের অবস্থা দেখে নিন।': 'Enter your memo number to check its payment status.', 'মেমো নম্বর': 'Memo Number',
  'মেমো খুঁজুন': 'Search Memo', 'জিহান মৎস্য বীজাগার': 'Jihan Fish Hatchery', 'বিশ্বস্ততায়, মানসম্মত পোনায়': 'Trusted for quality fingerlings', 'ঠিকানা': 'Address', 'ফোন': 'Phone', 'পরিচালক': 'Director', 'ইনশাল্লাহ আবার আসবেন': 'We hope to see you again',
  'নিরাপদ প্রবেশ': 'Secure Login', 'অ্যাডমিন প্যানেল': 'Admin Panel', 'আপনার অ্যাকাউন্ট দিয়ে প্রবেশ করুন': 'Sign in to your account', 'ইউজার আইডি': 'User ID', 'পাসওয়ার্ড': 'Password', 'লগইন করুন': 'Log In', 'প্রাথমিক লগইন: admin / admin': 'Default login: admin / admin', 'ব্যবস্থাপনা': 'Management', 'অ্যাডমিন কন্ট্রোল': 'Admin Control', 'স্বাগতম,': 'Welcome,', 'লগআউট': 'Log Out',
  'পণ্য নিয়ন্ত্রণ': 'Products', 'মেমো তৈরি': 'Create Memo', 'মেমো সমূহ': 'Memos', 'মেমোসমূহ': 'Memos', 'অ্যাডমিন নিয়ন্ত্রণ': 'Admin Management', 'সাইট সেটিংস': 'Site Settings', 'অপরিশোধ গ্রাহক': 'Unpaid Customer', 'অপরিশোধ গ্রাহকদের তালিকা': 'Unpaid Customers', 'গ্রাহকের তথ্য': 'Customer Information', 'গ্রাহকের তথ্য ও সংশ্লিষ্ট মেমো শুধু দেখা যাবে; সম্পাদনা বা মুছে ফেলার অপশন নেই।': 'Customer details and related memos are view-only; editing and deleting are disabled.', 'বিস্তারিত দেখতে গ্রাহক নির্বাচন করুন।': 'Select a customer to view details.', 'মোট মেমো': 'Total Memos', 'সর্বশেষ মেমো': 'Latest Memo', 'টি মেমো': 'memos', 'এখনো কোনো গ্রাহকের তথ্য নেই।': 'No customer information yet.', 'মেমোর তথ্য': 'Memo Details', 'জমার বিবরণ': 'Payment Details', 'বিস্তারিত দেখতে গ্রাহক নির্বাচন করুন।': 'Select a customer to view details.', 'বাকি গ্রাহকদের তালিকা': 'Customers with Outstanding Balances', 'যেসব মেমোতে বাকি আছে, সেসব গ্রাহকের যোগাযোগের তথ্য দেখুন': 'View contact details for customers with unpaid memo balances', 'A4 কাগজে প্রিন্ট করুন': 'Print on A4 Paper', 'মেমো নং': 'Memo No.', 'তারিখ': 'Date', 'গ্রাহকের নাম': 'Customer Name', 'ফোন নম্বর': 'Phone Number', 'ঠিকানা': 'Address', 'বাকি টাকা': 'Amount Due', 'কোনো বাকি গ্রাহক নেই।': 'No customers have an outstanding balance.', 'বাকি প্রিভিউ': 'Due Preview', 'প্রিভিউ বন্ধ': 'Hide Preview', 'কেনা পণ্য': 'Purchased Products', 'বাকি ও জমার বিবরণ': 'Due and Payment Details', 'মেমোর তারিখ': 'Memo Date', 'মোট জমা': 'Total Paid', 'বর্তমান বাকি': 'Current Due', 'জমার তারিখ ও পরিমাণ': 'Payment Dates and Amounts', 'প্রাথমিক জমা': 'Initial Payment', 'এখনো কোনো টাকা জমা হয়নি': 'No payments have been made yet.',
  'প্রোডাক্ট ডিটেলস কন্ট্রোল': 'Product Details', 'পণ্য যোগ, সম্পাদনা ও মুছে ফেলুন': 'Add, edit, or delete products', '＋ নতুন পণ্য': '+ Add Product', 'নতুন পণ্য যোগ': 'Add New Product', 'পণ্যের নাম': 'Product Name', 'দর (টাকা/কেজি)': 'Price (Tk/kg)', 'ছবির লিংক': 'Image URL', 'অথবা ছবি আপলোড': 'Or Upload Image', 'ছোট বিবরণ': 'Short Description', 'সংরক্ষণ করুন': 'Save', 'বাতিল': 'Cancel', 'পণ্য সম্পাদনা': 'Edit Product', 'সম্পাদনা': 'Edit', 'মুছুন': 'Delete', 'এখনো কোনো পণ্য নেই।': 'No products yet.', 'দর নির্ধারিত নয়': 'Price not set', 'দর জানতে ফোন করুন': 'Call for price', 'যোগাযোগ': 'Contact', 'দর নেই': 'No price', 'নির্বাচন': 'Select', 'আগে পণ্য যোগ করুন।': 'Add a product first.', 'পণ্য নির্বাচন': 'Select Product', 'পণ্য যোগ': 'Add Product',
  'নতুন মেমো তৈরি': 'Create a New Memo', 'পণ্য নির্বাচন করুন, পরিমাণ ও মূল্য স্বয়ংক্রিয়ভাবে হিসাব হবে': 'Select products; quantities and prices are calculated automatically', 'পরবর্তী মেমো:': 'Next Memo:', 'কাস্টমারের ফোন': 'Customer Phone', 'কাস্টমারের নাম': 'Customer Name', 'কাস্টমারের ঠিকানা': 'Customer Address', 'মেমো ক্রমিক নম্বর': 'Memo Serial Number', 'মেমোর হিসাব': 'Memo Summary', 'পেমেন্টের অবস্থা': 'Payment Status', 'পরিশোধ': 'Paid', 'বাকি': 'Due', 'অগ্রিম জমা (টাকা)': 'Advance Payment (Tk)', 'নিজে লিখুন': 'Enter manually', 'ডিসকাউন্ট (টাকা)': 'Discount (Tk)', 'মোট': 'Total', 'মেমো তৈরি করুন': 'Create Memo', 'এখনো কোনো পণ্য যোগ করা হয়নি।': 'No products added yet.', 'পরিমাণ (কেজি)': 'Quantity (kg)', 'পণ্যের পরিমাণ': 'Product Quantity', 'মাছের পরিমাণ': 'Fish Quantity', 'পণ্য যোগ করুন': 'Add Product', 'সঠিক পরিমাণ লিখুন।': 'Enter a valid quantity.',
  'মেমো সার্চ ও ব্যবস্থাপনা': 'Memo Search & Management', 'মেমো নম্বর দিয়ে খুঁজুন, বাকি টাকা জমা নিন বা তথ্য আপডেট করুন': 'Search by memo number, collect due payments, or update details', 'বিস্তারিত': 'Details', 'এখনো কোনো মেমো তৈরি হয়নি।': 'No memos yet.', 'তথ্য আপডেট': 'Update Details', 'তথ্য সংরক্ষণ করুন': 'Save Details', 'কাস্টমারের নাম, ফোন নম্বর ও ঠিকানা পরিবর্তন করুন।': 'Update the customer name, phone number, and address.', 'নাম দেওয়া হয়নি': 'Name not provided', 'নামহীন': 'Unnamed', 'ফোন নেই': 'No phone', 'ফোন নম্বর': 'Phone Number', 'দেওয়া হয়নি': 'Not provided', 'সর্বমোট': 'Grand Total', 'অগ্রিম জমা': 'Advance Paid', 'ডিসকাউন্ট': 'Discount', 'পরিশোধ হয়েছে': 'Paid', 'পরিশোধ হয়নি': 'Unpaid', 'মোট ক্রয়': 'Purchase Total', 'বাকি নেই': 'No balance due', 'পণ্যের তথ্য নেই': 'No product details', 'প্রিন্ট': 'Print', 'বাকি পরিশোধ': 'Collect Due Payment', 'বাকি পরিশোধ': 'Pay Due', 'বাকি টাকা জমা নিন': 'Collect Due Payment', 'এই অ্যাডমিনের মেমো পরিশোধের অনুমতি নেই।': 'This admin is not authorized to collect memo payments.', 'এই মেমোর পেমেন্ট করতে অনুমতিপ্রাপ্ত অ্যাডমিন দিয়ে লগইন করুন।': 'Log in with an admin authorized to collect payment for this memo.', 'এই মেমোর বাকি': 'Balance due for this memo', 'জমার পরিমাণ ও গ্রহণকারীর নাম লিখুন।': 'Enter the payment amount and recipient name.', 'বাকির পরিমাণ (পরিবর্তন করা যাবে না)': 'Due amount (cannot be changed)', 'ডিসকাউন্ট (টাকা)': 'Discount (Tk)', 'গ্রাহকের নাম ও বাকি টাকা দেখা যাবে; বাকি টাকার ঘরটি পরিবর্তন করা যাবে না। চাইলে ডিসকাউন্ট দিন এবং জমার পরিমাণ লিখুন।': 'The customer name and due amount are shown; the due amount cannot be changed. Apply a discount if needed and enter the payment amount.', 'ডিসকাউন্ট ও জমার পরিমাণ মিলিয়ে বাকি টাকার বেশি হতে পারবে না।': 'Discount and payment together cannot exceed the due amount.', 'জমার পরিমাণ (টাকা)': 'Payment Amount (Tk)', 'টাকা গ্রহণকারীর নাম': 'Received By', 'পেমেন্ট সংরক্ষণ': 'Save Payment', 'নিশ্চিত করুন': 'Confirm', 'মেমো মুছুন': 'Delete Memo', 'এই নম্বরে কোনো মেমো পাওয়া যায়নি।': 'No memo found with this number.', 'মেমো #': 'Memo #', 'তারিখ:': 'Date:', 'নাম:': 'Name:',
  'নতুন অ্যাডমিন অ্যাকাউন্ট তৈরি ও পাসওয়ার্ড পরিবর্তন': 'Create admin accounts and change passwords', 'অ্যাডমিন কাজের হিসাব': 'Admin Activity Report', 'প্রতিটি অ্যাডমিনের তৈরি মেমো ও গ্রহণ করা পেমেন্টের বিস্তারিত': 'Memo and payment details for each admin',   'তৈরি মেমো': 'Memos Created', 'মোট মেমোর মূল্য': 'Total Memo Value', 'গ্রহণ করা পেমেন্ট': 'Payments Collected', 'মেমো নং': 'Memo No.', 'গ্রাহক': 'Customer', 'টাকার পরিমাণ': 'Amount', 'ভিউ': 'View', 'বিস্তারিত দেখতে অ্যাডমিন নির্বাচন করুন।': 'Select an admin to view details.', 'কোনো কাজের হিসাব পাওয়া যায়নি।': 'No activity records found.', 'এখনো কোনো মেমো তৈরি করেননি।': 'No memos created yet.', 'এখনো কোনো পেমেন্ট গ্রহণ করেননি।': 'No payments collected yet.', 'নতুন অ্যাডমিন যোগ করুন': 'Add New Admin', 'অ্যাডমিনের নাম': 'Admin Name', 'অ্যাডমিন যুক্ত করুন': 'Add Admin', 'অ্যাডমিন প্যানেলের অ্যাক্সেস নির্বাচন করুন': 'Select Admin Panel Access', 'মেমো পরিশোধের অনুমতি': 'Permission to collect memo payments', 'অ্যাক্সেস': 'Access', 'নতুন অ্যাডমিনের জন্য অন্তত একটি অ্যাক্সেস নির্বাচন করুন।': 'Select at least one access permission for the new admin.', 'কোনো অ্যাডমিন অ্যাকাউন্ট নেই।': 'No admin accounts.', 'পাসওয়ার্ড বদল': 'Change Password', 'পাসওয়ার্ড পরিবর্তন': 'Change Password', 'নতুন পাসওয়ার্ড': 'New Password', 'পাসওয়ার্ড সংরক্ষণ': 'Save Password', 'নতুন পাসওয়ার্ড লিখুন।': 'Enter a new password.', 'আপনি': 'You',
  'হোমপেজ ও গ্যালারি সেটিংস': 'Homepage & Gallery Settings', 'হিরো ছবির জন্য ১–৭টি স্লাইড ছবি URL বা আপলোড করুন; প্রতি ৩ সেকেন্ডে ছবি বদলাবে।': 'Add 1–7 hero slide images by URL or upload; the image changes every 3 seconds.', 'ওয়েবসাইটের ডিফল্ট ভাষা': 'Website Default Language', 'হিরো শিরোনাম': 'Hero Heading', 'হিরো লেখা': 'Hero Text', 'প্রধান ছবির লিংক': 'Main Image URL', 'প্রধান ছবি আপলোড': 'Upload Main Image', 'হিরো স্লাইড ছবি ১-এর লিংক': 'Hero slide image 1 URL', 'স্লাইড ছবি ১ আপলোড': 'Upload slide image 1', 'স্লাইড ছবি ২-এর লিংক': 'Slide image 2 URL', 'স্লাইড ছবি ৩-এর লিংক': 'Slide image 3 URL', 'স্লাইড ছবি ৪-এর লিংক': 'Slide image 4 URL', 'স্লাইড ছবি ৫-এর লিংক': 'Slide image 5 URL', 'স্লাইড ছবি ৬-এর লিংক': 'Slide image 6 URL', 'স্লাইড ছবি ৭-এর লিংক': 'Slide image 7 URL', 'স্লাইড ছবি ২ আপলোড': 'Upload slide image 2', 'স্লাইড ছবি ৩ আপলোড': 'Upload slide image 3', 'স্লাইড ছবি ৪ আপলোড': 'Upload slide image 4', 'স্লাইড ছবি ৫ আপলোড': 'Upload slide image 5', 'স্লাইড ছবি ৬ আপলোড': 'Upload slide image 6', 'স্লাইড ছবি ৭ আপলোড': 'Upload slide image 7', 'পরামর্শ শিরোনাম': 'Advice Heading', 'পরামর্শের লেখা': 'Advice Text', 'গ্যালারি ছবির লিংক ১': 'Gallery Image URL 1', 'গ্যালারি ছবির লিংক ২': 'Gallery Image URL 2', 'গ্যালারি ছবির লিংক ৩': 'Gallery Image URL 3', 'সাইট আপডেট করুন': 'Update Website', 'ছবি যোগ করতে অ্যাডমিন প্যানেলের সাইট সেটিংস ব্যবহার করুন।': 'Add images in Admin Panel → Site Settings.',
  'অ্যাডমিন প্যানেলের ভাষা': 'Admin Panel Language', 'ছবি': 'Image', 'ছবি দেখুন': 'View Image', 'পণ্য মুছে ফেলুন': 'Delete product', 'কেজি': 'kg', 'দর জানতে ফোন করুন': 'Call for price',
  'মেমো তৈরি/প্রিন্ট': 'Create/Print Memo', 'তথ্য এডিট': 'Edit Details', 'ডিলিট': 'Delete', 'বাকি পরিশোধ': 'Collect Payment', 'অপশন': 'Actions'
};
const textSources = new WeakMap();
const lastTranslatedText = new WeakMap();
const attributeSources = new WeakMap();
function translated(value, language) {
  if (language !== 'en') return value;
  if (translations[value.trim()]) return value.replace(value.trim(), translations[value.trim()]);
  let output = value;
  Object.keys(translations).sort((a, b) => b.length - a.length).forEach(source => {
    if (source.length > 3 && output.includes(source)) output = output.replaceAll(source, translations[source]);
  });
  return output;
}
function applyLanguage() {
  document.documentElement.lang = siteLanguage;
  document.title = siteLanguage === 'en' ? translations['জিহান মৎস্য বীজাগার | উন্নতমানের মাছের রেনু পোনা'] : 'জিহান মৎস্য বীজাগার | উন্নতমানের মাছের রেনু পোনা';
  $('publicLanguage').value = siteLanguage;
  $('adminLanguage').value = adminPanelLanguage;
  const languageFor = element => element.closest('.print-title, .print-director, .print-table') ? 'bn' : element.closest('#adminModal, #actionDialog') ? adminPanelLanguage : siteLanguage;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const current = node.nodeValue;
    if (lastTranslatedText.has(node) && current !== lastTranslatedText.get(node)) textSources.set(node, current);
    else if (!textSources.has(node)) textSources.set(node, current);
    const source = textSources.get(node);
    const output = translated(source, languageFor(node.parentElement));
    if (current !== output) node.nodeValue = output;
    lastTranslatedText.set(node, output);
  }
  document.querySelectorAll('[placeholder], [aria-label], [title]').forEach(element => {
    ['placeholder', 'aria-label', 'title'].forEach(attribute => {
      if (!element.hasAttribute(attribute)) return;
      let sources = attributeSources.get(element);
      if (!sources) { sources = {}; attributeSources.set(element, sources); }
      const current = element.getAttribute(attribute);
      if (!(attribute in sources) || current !== sources[attribute].last) sources[attribute] = { original: current, last: current };
      const output = translated(sources[attribute].original, languageFor(element));
      if (current !== output) element.setAttribute(attribute, output);
      sources[attribute].last = output;
    });
  });
  applyPublicCopy();
}
const $ = id => document.getElementById(id);
const publicTextNodes = (() => {
  const nodes = [];
  const skip = '#heroGallery, #productGrid, #productCount, #publicMemoResult, #year, #heroTitle, #heroText, #adviceTitle, #adviceText, #toast, #adminModal, #actionDialog';
  ['header', 'main', 'footer'].forEach(selector => {
    const walker = document.createTreeWalker(document.querySelector(selector), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim() || node.parentElement.closest(skip)) continue;
      nodes.push({ key: `text-${nodes.length + 1}`, node, original: node.nodeValue });
    }
  });
  return nodes;
})();
const money = amount => `৳${Number(amount || 0).toLocaleString('bn-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fishEmoji = ['🐟', '🐠', '🐡', '🐟'];
function toast(message) {
  const node = $('toast'); node.textContent = message; node.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}
function actionDialog({ title, message = '', fields = [], submitText = 'নিশ্চিত করুন', danger = false }) {
  const backdrop = $('actionDialog');
  $('actionDialogTitle').textContent = title;
  $('actionDialogMessage').textContent = message;
  $('actionDialogSubmit').textContent = submitText;
  $('actionDialogSubmit').classList.toggle('button-danger', danger);
  $('actionDialogFields').innerHTML = fields.map(field => {
    const control = Array.isArray(field.options) && field.name === 'paymentStatus'
      ? `<div class="payment-status-options" role="radiogroup" aria-label="${escapeHTML(field.label)}">${field.options.map(option => {
        const isPaid = option.value === 'paid';
        const checked = String(option.value) === String(field.value) ? 'checked' : '';
        return `<label class="payment-status-choice ${isPaid ? 'choice-paid' : 'choice-due'}"><input type="radio" name="${escapeHTML(field.name)}" value="${escapeHTML(option.value)}" ${checked} required><span class="payment-choice-content"><span class="payment-choice-icon" aria-hidden="true">${isPaid ? '✓' : '৳'}</span><span class="payment-choice-copy"><strong>${escapeHTML(option.label)}</strong><small>${isPaid ? 'বাকি টাকা শূন্য হিসেবে গণ্য হবে' : 'মেমোতে বাকি টাকা দেখানো থাকবে'}</small></span><span class="payment-choice-check" aria-hidden="true">✓</span></span></label>`;
      }).join('')}</div>`
      : Array.isArray(field.options)
        ? `<select name="${escapeHTML(field.name)}" ${field.required === false ? '' : 'required'}>${field.options.map(option => `<option value="${escapeHTML(option.value)}" ${String(option.value) === String(field.value) ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}</select>`
        : `<input name="${escapeHTML(field.name)}" type="${escapeHTML(field.type || 'text')}" value="${escapeHTML(field.value ?? '')}" ${field.inputmode ? `inputmode="${escapeHTML(field.inputmode)}"` : ''} ${field.readonly ? 'readonly' : ''} ${field.required === false ? '' : 'required'} ${field.min !== undefined ? `min="${escapeHTML(field.min)}"` : ''} ${field.max !== undefined ? `max="${escapeHTML(field.max)}"` : ''} step="${escapeHTML(field.step || 'any')}" />`;
    return field.name === 'paymentStatus'
      ? `<div class="action-dialog-field payment-status-field"><span class="payment-status-label">${escapeHTML(field.label)}</span>${control}</div>`
      : `<label class="action-dialog-field">${escapeHTML(field.label)}${control}</label>`;
  }).join('');
  backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden', 'false');
  const firstInput = backdrop.querySelector('input');
  (firstInput || $('actionDialogSubmit')).focus();
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true; backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden', 'true');
      $('actionDialogForm').removeEventListener('submit', onSubmit);
      $('actionDialogCancel').removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKeydown);
      resolve(value);
    };
    const onSubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      finish(values);
    };
    const onCancel = () => finish(null);
    const onBackdrop = event => { if (event.target === backdrop) onCancel(); };
    const onKeydown = event => { if (event.key === 'Escape') onCancel(); };
    $('actionDialogForm').addEventListener('submit', onSubmit);
    $('actionDialogCancel').addEventListener('click', onCancel);
    backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKeydown);
  });
}
function nextMemoNumber() {
  const stored = Number(localStorage.getItem(STORE.counter));
  const last = memos.reduce((max, memo) => Math.max(max, Number(memo.id) || 0), 1000);
  return Math.max(stored || 1001, last + 1);
}
function setupImage(image, src, alt) {
  if (!src) { image.removeAttribute('src'); image.style.display = 'none'; return; }
  image.style.display = 'block'; image.src = src; image.alt = alt;
  image.onerror = () => { image.style.display = 'none'; };
}
let heroSlideTimer = null;
let activeHeroSlide = 0;
function showHeroSlide(index) {
  const image = $('heroImage');
  const slides = (settings.heroSlides || []).filter(Boolean);
  if (!slides.length) {
    image.classList.remove('hero-zoom');
    setupImage(image, settings.heroImage, 'মৎস্য চাষ');
    return;
  }
  activeHeroSlide = index % slides.length;
  image.classList.remove('hero-zoom');
  setupImage(image, slides[activeHeroSlide], 'মৎস্য চাষ');
  void image.offsetWidth;
  image.classList.add('hero-zoom');
}
function startHeroSlideshow() {
  clearInterval(heroSlideTimer);
  const slides = (settings.heroSlides || []).filter(Boolean);
  if (!slides.length) {
    setupImage($('heroImage'), settings.heroImage, 'মৎস্য চাষ');
    return;
  }
  showHeroSlide(0);
  if (slides.length > 1) heroSlideTimer = setInterval(() => showHeroSlide(activeHeroSlide + 1), 3000);
}
function renderHomepage() {
  $('heroTitle').textContent = settings.heroTitle;
  $('heroText').textContent = settings.heroText;
  $('adviceTitle').innerHTML = escapeHTML(settings.adviceTitle).replace(/, /g, ',<br />');
  $('adviceText').textContent = settings.adviceText;
  startHeroSlideshow();
  const gallery = $('heroGallery');
  gallery.innerHTML = (settings.gallery || ['', '', '']).slice(0, 3).map((src, i) => `<button class="gallery-item" type="button" data-gallery="${i}" aria-label="ছবি ${i + 1} দেখুন">${src ? `<img src="${escapeHTML(src)}" alt="মৎস্য চাষের ছবি" onerror="this.style.display='none'">` : `<span class="gallery-placeholder">${fishEmoji[i]}</span>`}</button>`).join('');
  gallery.querySelectorAll('.gallery-item').forEach(button => button.addEventListener('click', () => {
    const src = settings.gallery[Number(button.dataset.gallery)];
    if (src) openImage(src);
    else toast('ছবি যোগ করতে অ্যাডমিন প্যানেলের সাইট সেটিংস ব্যবহার করুন।');
  }));
  $('productCount').textContent = `${products.length.toLocaleString('bn-BD')} ধরনের পোনা`;
  $('productGrid').innerHTML = products.map((product, index) => `<article class="product-card"><div class="product-image">${product.image ? `<img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" onerror="this.style.display='none'">` : `<div class="fish-symbol">${fishEmoji[index % fishEmoji.length]}</div>`}</div><div class="product-card-info"><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description || 'উন্নতমানের রেনু পোনা')}</p><div class="product-card-bottom"><span class="product-price">${Number(product.price) > 0 ? `${money(product.price)} <small>/ কেজি</small>` : 'দর জানতে ফোন করুন'}</span><button type="button" data-product-call="${escapeHTML(product.name)}">যোগাযোগ</button></div></div></article>`).join('');
  document.querySelectorAll('[data-product-call]').forEach(button => button.addEventListener('click', () => { window.location.href = 'tel:+8801722736633'; }));
}
function openImage(src) {
  const overlay = document.createElement('div'); overlay.className = 'image-lightbox';
  overlay.innerHTML = `<button aria-label="বন্ধ করুন">×</button><img src="${escapeHTML(src)}" alt="বড় ছবি">`;
  overlay.addEventListener('click', () => overlay.remove()); document.body.appendChild(overlay);
}
function renderAdminProducts() {
  const actions = hasAdminAccess('productsAdmin');
  $('adminProductList').innerHTML = products.map(p => `<div class="admin-list-row"><div><strong>${escapeHTML(p.name)} <span class="product-price">${p.price > 0 ? money(p.price) + '/কেজি' : 'দর নির্ধারিত নয়'}</span></strong><small>${escapeHTML(p.description || '')}</small></div>${actions ? `<div class="row-actions"><button class="small-action" data-edit-product="${escapeHTML(p.id)}">সম্পাদনা</button><button class="small-action danger" data-delete-product="${escapeHTML(p.id)}">মুছুন</button></div>` : ''}</div>`).join('') || '<div class="empty-state">এখনো কোনো পণ্য নেই।</div>';
  $('adminProductList').querySelectorAll('[data-edit-product]').forEach(btn => btn.addEventListener('click', () => editProduct(btn.dataset.editProduct)));
  $('adminProductList').querySelectorAll('[data-delete-product]').forEach(btn => btn.addEventListener('click', () => {
    if (!hasAdminAccess('productsAdmin')) return;
    const p = products.find(item => item.id === btn.dataset.deleteProduct);
    if (p && confirm(`${p.name} পণ্যটি মুছে ফেলবেন?`)) { products = products.filter(item => item.id !== p.id); save(STORE.products, products); renderAdminProducts(); renderHomepage(); toast('পণ্য মুছে ফেলা হয়েছে।'); }
  }));
}
function editProduct(id) {
  if (!hasAdminAccess('productsAdmin')) return;
  const p = products.find(item => item.id === id); if (!p) return;
  $('productId').value = p.id; $('productName').value = p.name; $('productPrice').value = p.price || '';
  $('productImage').value = p.image?.startsWith('data:') ? '' : (p.image || ''); $('productDescription').value = p.description || '';
  $('productImageFile').value = ''; $('productFormTitle').textContent = 'পণ্য সম্পাদনা'; $('productForm').classList.remove('hidden');
  $('productForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function renderPicker() {
  $('memoProductPicker').innerHTML = products.map((product, index) => `<article class="product-card memo-pick-card" data-pick-product="${escapeHTML(product.id)}"><div class="product-image">${product.image ? `<img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" onerror="this.style.display='none'">` : `<div class="fish-symbol">${fishEmoji[index % fishEmoji.length]}</div>`}</div><div class="product-card-info"><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description || 'উন্নতমানের রেনু পোনা')}</p><div class="product-card-bottom"><span class="product-price">${Number(product.price) > 0 ? `${money(product.price)} <small>/ কেজি</small>` : 'দর জানতে ফোন করুন'}</span><button type="button">নির্বাচন</button></div></div></article>`).join('') || '<div class="empty-state">আগে পণ্য যোগ করুন।</div>';
  $('memoProductPicker').querySelectorAll('.memo-pick-card').forEach(card => card.addEventListener('click', () => addItem(card.dataset.pickProduct)));
  const memoNumber = nextMemoNumber().toLocaleString('bn-BD');
  $('nextMemoId').textContent = memoNumber;
  $('memoNumberDisplay').textContent = memoNumber;
}
async function addItem(id) {
  if (!hasAdminAccess('memoAdmin')) return;
  const product = products.find(p => p.id === id); if (!product) return;
  if (!(Number(product.price) > 0)) { toast('মেমো তৈরির আগে অ্যাডমিন প্যানেল থেকে পণ্যের দর নির্ধারণ করুন।'); return; }
  const response = await actionDialog({
    title: 'মাছের পরিমাণ', message: `প্রতি কেজি ${money(product.price)}।`, submitText: 'পণ্য যোগ করুন',
    fields: [{ name: 'quantity', label: 'পরিমাণ (কেজি)', value: '', inputmode: 'decimal', min: '0.01', step: '0.01' }]
  });
  if (!response) return;
  const quantity = Number(response.quantity.replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) { toast('সঠিক পরিমাণ লিখুন।'); return; }
  selectedItems.push({ productId: product.id, name: product.name, price: Number(product.price), quantity });
  renderSelectedItems();
}
function invalidateMemoDraft() {
  pendingMemo = null;
  $('saveMemoButton').disabled = true;
  $('memoSaveStatus').textContent = '';
  $('memoPreview').classList.add('hidden');
  $('memoPreview').innerHTML = '';
}
function renderSelectedItems() {
  invalidateMemoDraft();
  const area = $('selectedMemoItems');
  if (!selectedItems.length) area.innerHTML = '<div class="empty-state">এখনো কোনো পণ্য যোগ করা হয়নি।</div>';
  else area.innerHTML = selectedItems.map((item, i) => `<div class="memo-line"><span class="line-number">${(i + 1).toLocaleString('bn-BD')}.</span><span>${escapeHTML(item.name)}<small>${item.quantity.toLocaleString('bn-BD')} কেজি × ${money(item.price)}</small></span><strong>${money(item.quantity * item.price)}</strong><button type="button" aria-label="পণ্য বাদ দিন" data-remove-line="${i}">×</button></div>`).join('');
  area.querySelectorAll('[data-remove-line]').forEach(btn => btn.addEventListener('click', () => { selectedItems.splice(Number(btn.dataset.removeLine), 1); renderSelectedItems(); }));
  updateMemoTotal();
}
function updateMemoTotal() {
  const subtotal = selectedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discount = Math.min(subtotal, Math.max(0, Number($('discountAmount').value) || 0));
  const balanceAfterDiscount = Math.max(0, subtotal - discount);
  const advance = Math.min(balanceAfterDiscount, Math.max(0, Number($('advanceAmount').value.replace(',', '.')) || 0));
  $('memoSubtotal').textContent = money(subtotal);
  $('memoDue').textContent = money(Math.max(0, balanceAfterDiscount - advance));
}
function normalizePhone(phone) { return String(phone || '').replace(/[\s-]/g, ''); }
function fillCustomer(phone) {
  const customer = customers[normalizePhone(phone)];
  if (customer) { $('customerName').value = customer.name || ''; $('customerAddress').value = customer.address || ''; }
}
function showLogin() {
  activeAdmin = null;
  $('adminModal').classList.add('open'); $('adminModal').setAttribute('aria-hidden', 'false');
  $('loginView').classList.remove('hidden'); $('adminView').classList.add('hidden'); $('loginMessage').textContent = '';
  $('loginUser').focus();
}
function showAdmin() {
  $('loginView').classList.add('hidden'); $('adminView').classList.remove('hidden');
  $('loggedAdmin').textContent = activeAdmin.name;
  applyAdminPermissions();
  renderAdminProducts(); renderPicker(); renderAdminAccounts(); renderAdminWorkReport(); renderMemos(); renderCustomerInfo(); populateSettingsForm();
}
function closeAdmin() { $('adminModal').classList.remove('open'); $('adminModal').setAttribute('aria-hidden', 'true'); }
function renderAdminAccounts() {
  $('adminAccountsList').innerHTML = admins.map((admin, index) => {
    const access = adminPermissions(admin).map(panel => translated(ADMIN_PANEL_LABELS[panel], adminPanelLanguage)).join(', ');
    const actions = hasAdminAccess('adminsAdmin') ? `<div class="row-actions"><button type="button" class="small-action" data-change-password="${index}">পাসওয়ার্ড বদল</button>${String(admin.user).toLowerCase() !== 'admin' ? `<button type="button" class="small-action danger" data-remove-admin="${index}">মুছুন</button>` : ''}</div>` : '';
    return `<div class="admin-list-row"><div><strong>${escapeHTML(admin.name || 'অ্যাডমিন')}</strong><small>ইউজার আইডি: ${escapeHTML(admin.user || '')}${String(admin.user).toLowerCase() === String(activeAdmin?.user).toLowerCase() ? ' · আপনি' : ''}</small><small>অ্যাক্সেস: ${escapeHTML(access)}</small></div>${actions}</div>`;
  }).join('') || '<div class="empty-state">কোনো অ্যাডমিন অ্যাকাউন্ট নেই।</div>';
  $('adminAccountsList').querySelectorAll('[data-change-password]').forEach(btn => btn.addEventListener('click', async () => {
    if (!hasAdminAccess('adminsAdmin')) return;
    const admin = admins[Number(btn.dataset.changePassword)]; if (!admin) return;
    const response = await actionDialog({
      title: 'পাসওয়ার্ড পরিবর্তন',
      message: 'নতুন পাসওয়ার্ড লিখুন।',
      submitText: 'পাসওয়ার্ড সংরক্ষণ',
      fields: [{ name: 'password', label: 'নতুন পাসওয়ার্ড', type: 'password' }]
    });
    if (!response) return;
    const pass = response.password;
    if (!pass.trim()) { toast('পাসওয়ার্ড খালি রাখা যাবে না।'); return; }
    const oldPass = admin.pass;
    admin.pass = pass;
    try { save(STORE.admins, admins); toast('পাসওয়ার্ড আপডেট হয়েছে।'); }
    catch { admin.pass = oldPass; toast('সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।'); }
  }));
  $('adminAccountsList').querySelectorAll('[data-remove-admin]').forEach(btn => btn.addEventListener('click', () => {
    if (!hasAdminAccess('adminsAdmin')) return;
    const index = Number(btn.dataset.removeAdmin); const admin = admins[index]; if (!admin) return;
    if (String(admin.user).toLowerCase() === String(activeAdmin?.user).toLowerCase()) { toast('লগইন করা অ্যাডমিনের অ্যাকাউন্ট মুছতে পারবেন না।'); return; }
    if (confirm(`${admin.name || admin.user}-এর অ্যাকাউন্ট মুছে ফেলবেন?`)) {
      const removed = admins.splice(index, 1)[0];
      try { save(STORE.admins, admins); renderAdminAccounts(); toast('অ্যাডমিন অ্যাকাউন্ট মুছে ফেলা হয়েছে।'); }
      catch { admins.splice(index, 0, removed); toast('সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।'); }
    }
  }));
}
function renderAdminWorkReport(selectedIndex = null) {
  const report = $('adminWorkReport');
  if (!report) return;
  const activities = new Map();
  const ensureActivity = name => {
    const label = String(name || '').trim() || 'অজানা অ্যাডমিন';
    const key = label.toLocaleLowerCase();
    if (!activities.has(key)) activities.set(key, { name: label, memos: [], payments: [] });
    return activities.get(key);
  };
  admins.forEach(admin => ensureActivity(admin?.name || admin?.user));
  memos.forEach(memo => {
    const creator = ensureActivity(memo.createdBy);
    creator.memos.push(memo);
    const history = Array.isArray(memo.paymentHistory) ? memo.paymentHistory : [];
    history.forEach(payment => {
      const amount = Number(payment.amount) || 0;
      if (amount > 0) ensureActivity(payment.receivedBy).payments.push({ memo, amount, date: payment.date || memo.date || '' });
    });
    // Older memos may not have a payment history; retain their advance under the creator.
    if (!history.length && Number(memo.advance) > 0) {
      creator.payments.push({ memo, amount: Number(memo.advance), date: memo.date || '', legacy: true });
    }
  });
  const activityList = [...activities.values()];
  if (!activityList.length) {
    report.innerHTML = '<div class="empty-state">কোনো কাজের হিসাব পাওয়া যায়নি।</div>';
    return;
  }
  const adminRows = activityList.map((activity, index) => `<div class="admin-list-row"><div><strong>${escapeHTML(activity.name)}</strong></div><button type="button" class="small-action" data-view-admin-report="${index}">ভিউ</button></div>`).join('');
  const activity = selectedIndex === null ? null : activityList[Number(selectedIndex)];
  let detail = '<div class="empty-state">বিস্তারিত দেখতে অ্যাডমিন নির্বাচন করুন।</div>';
  if (activity) {
    const memoTotal = activity.memos.reduce((sum, memo) => sum + Number(memo.total || 0), 0);
    const paymentsTotal = activity.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const memoRows = activity.memos.slice().reverse().map(memo => `<tr><td>${escapeHTML(memo.id)}</td><td>${escapeHTML(memo.date || '')}</td><td>${escapeHTML(memo.customerName || 'নাম দেওয়া হয়নি')}</td><td>${money(memo.total)}</td></tr>`).join('');
    const paymentRows = activity.payments.slice().reverse().map(payment => `<tr><td>${escapeHTML(payment.memo.id)}</td><td>${escapeHTML(payment.date)}</td><td>${escapeHTML(payment.memo.customerName || 'নাম দেওয়া হয়নি')}</td><td>${money(payment.amount)}${payment.legacy ? ' · পুরোনো হিসাব' : ''}</td></tr>`).join('');
    detail = `<article class="admin-report-card"><h4>${escapeHTML(activity.name)}</h4><div class="admin-report-stats"><div><span>তৈরি মেমো</span><strong>${activity.memos.length.toLocaleString('bn-BD')}</strong></div><div><span>মোট মেমোর মূল্য</span><strong>${money(memoTotal)}</strong></div><div><span>গ্রহণ করা পেমেন্ট</span><strong>${money(paymentsTotal)}</strong></div></div><h5>তৈরি মেমোর বিস্তারিত</h5>${memoRows ? `<div class="admin-report-table-wrap"><table class="admin-report-table"><thead><tr><th>মেমো নং</th><th>তারিখ</th><th>গ্রাহক</th><th>মেমোর মূল্য</th></tr></thead><tbody>${memoRows}</tbody></table></div>` : '<div class="empty-state">এখনো কোনো মেমো তৈরি করেননি।</div>'}<h5>গ্রহণ করা পেমেন্টের বিস্তারিত</h5>${paymentRows ? `<div class="admin-report-table-wrap"><table class="admin-report-table"><thead><tr><th>মেমো নং</th><th>তারিখ</th><th>গ্রাহক</th><th>টাকার পরিমাণ</th></tr></thead><tbody>${paymentRows}</tbody></table></div>` : '<div class="empty-state">এখনো কোনো পেমেন্ট গ্রহণ করেননি।</div>'}</article>`;
  }
  report.innerHTML = `<div class="admin-report-admin-list">${adminRows}</div><div class="admin-report-detail">${detail}</div>`;
  report.querySelectorAll('[data-view-admin-report]').forEach(button => button.addEventListener('click', () => renderAdminWorkReport(button.dataset.viewAdminReport)));
}
function applyPublicCopy() {
  const copy = settings.publicCopy || {};
  publicTextNodes.forEach(({ key, node }) => {
    if (Object.prototype.hasOwnProperty.call(copy, key) && node.nodeValue !== copy[key]) node.nodeValue = copy[key];
  });
}
function renderPublicCopyEditor() {
  const copy = settings.publicCopy || {};
  $('publicCopyEditor').innerHTML = publicTextNodes.map(({ key, original }) => {
    const value = Object.prototype.hasOwnProperty.call(copy, key) ? copy[key] : original.trim();
    const label = escapeHTML(original.trim());
    const escapedValue = escapeHTML(value);
    const field = original.trim().length > 65
      ? `<textarea data-public-copy="${key}" rows="2">${escapedValue}</textarea>`
      : `<input data-public-copy="${key}" value="${escapedValue}" />`;
    return `<label title="${label}">${label}${field}</label>`;
  }).join('');
}
function updateHeroSlide(index, src) {
  settings.heroSlides[index] = src;
  if (index === 0) settings.heroImage = src;
  try { save(STORE.settings, settings); } catch { toast('ছবি সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।'); }
  renderHomepage();
}
function bindHeroSlideSetting(index, urlId, fileId) {
  const url = $(urlId);
  const file = $(fileId);
  url.onchange = () => updateHeroSlide(index, url.value.trim());
  file.onchange = () => {
    const imageFile = file.files?.[0];
    if (!imageFile) return;
    const reader = new FileReader();
    reader.onload = () => updateHeroSlide(index, String(reader.result));
    reader.onerror = () => toast('ছবিটি পড়া যায়নি। অন্য ছবি নির্বাচন করুন।');
    reader.readAsDataURL(imageFile);
  };
}
function populateSettingsForm() {
  $('siteDefaultLanguage').value = settings.language || 'bn';
  $('settingHeroTitle').value = settings.heroTitle; $('settingHeroText').value = settings.heroText;
  $('settingHeroImage').value = settings.heroSlides[0]?.startsWith('data:') ? '' : (settings.heroSlides[0] || settings.heroImage || '');
  $('settingHeroImageFile').value = '';
  bindHeroSlideSetting(0, 'settingHeroImage', 'settingHeroImageFile');
  for (let i = 2; i <= 7; i++) {
    const image = settings.heroSlides[i - 1] || '';
    $(`heroSlideUrl${i}`).value = image.startsWith('data:') ? '' : image;
    $(`heroSlideFile${i}`).value = '';
    bindHeroSlideSetting(i - 1, `heroSlideUrl${i}`, `heroSlideFile${i}`);
  }
  $('settingAdviceTitle').value = settings.adviceTitle; $('settingAdviceText').value = settings.adviceText;
  (settings.gallery || []).forEach((image, i) => { $(`galleryImage${i + 1}`).value = image?.startsWith('data:') ? '' : (image || ''); $(`galleryFile${i + 1}`).value = ''; });
  renderPublicCopyEditor();
}
function memoDue(memo) {
  return Math.max(0, Number(memo.total || 0) - Number(memo.discount || 0) - Number(memo.advance || 0));
}
function memoCard(memo, adminMode = false) {
  const due = memoDue(memo);
  const paid = due <= 0;
  const items = memo.items.map(item => `<div><span>${escapeHTML(item.name)} — ${item.quantity.toLocaleString('bn-BD')} কেজি</span><strong>${money(item.quantity * item.price)}</strong></div>`).join('');
  return `<article class="memo-record"><div class="memo-record-head"><div><h4>মেমো #${escapeHTML(memo.id)}</h4><p>${escapeHTML(memo.customerName || 'নাম দেওয়া হয়নি')} · ${escapeHTML(memo.phone || 'ফোন নেই')} · ${escapeHTML(memo.date || '')}</p></div><span class="status-pill ${paid ? 'status-paid' : 'status-due'}">${paid ? 'পরিশোধ হয়েছে' : 'পরিশোধ হয়নি'}</span></div><div class="memo-record-items">${items}<div><span>সর্বমোট</span><strong>${money(memo.total)}</strong></div><div><span>অগ্রিম জমা</span><strong>${money(memo.advance)}</strong></div><div><span>ডিসকাউন্ট</span><strong>${money(memo.discount)}</strong></div><div><span>বাকি</span><strong>${money(due)}</strong></div>${memo.paidBy ? `<div><span>পরিশোধ গ্রহণকারী</span><strong>${escapeHTML(memo.paidBy)}</strong></div>` : ''}</div>${adminMode ? `${hasAdminAccess('memosAdmin') ? `<button class="button button-outline" data-print-memo="${escapeHTML(memo.id)}">প্রিন্ট</button> <button class="button button-outline" data-edit-memo="${escapeHTML(memo.id)}">তথ্য আপডেট</button>` : ''} ${!paid && hasAdminAccess('payMemos') ? `<button class="button button-primary" data-pay-memo="${escapeHTML(memo.id)}">বাকি পরিশোধ</button>` : ''}` : ''}</article>`;
}
function renderDueCustomers() {
  const area = $('dueCustomersPrintArea');
  if (!area) return;
  const dueMemos = memos.filter(memo => memoDue(memo) > 0);
  area.innerHTML = dueMemos.length
    ? `<h2 class="due-print-title">বাকি গ্রাহকদের তালিকা</h2><table class="due-customers-table"><thead><tr><th>মেমো নং</th><th>তারিখ</th><th>গ্রাহকের নাম</th><th>ফোন নম্বর</th><th>ঠিকানা</th><th>বাকি টাকা</th><th class="due-actions-col">অপশন</th></tr></thead><tbody>${dueMemos.map(memo => `<tr><td>${escapeHTML(memo.id)}</td><td>${escapeHTML(memo.date || '')}</td><td>${escapeHTML(memo.customerName || 'নাম দেওয়া হয়নি')}</td><td>${escapeHTML(memo.phone || 'দেওয়া হয়নি')}</td><td>${escapeHTML(memo.address || 'দেওয়া হয়নি')}</td><td>${money(memoDue(memo))}</td><td class="due-actions-col"><div class="due-row-actions">${hasAdminAccess('payMemos') ? `<button type="button" class="small-action" data-pay-memo="${escapeHTML(memo.id)}">বাকি পরিশোধ</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty-state">কোনো বাকি গ্রাহক নেই।</div>';
  bindMemoResultActions(area);
}
function renderMemos() {
  renderDueCustomers();
  const list = $('allMemosList');
  list.innerHTML = memos.slice().reverse().map(m => `<div class="admin-list-row"><div><strong>মেমো #${escapeHTML(m.id)} · ${escapeHTML(m.customerName || 'নামহীন')}</strong><small>${escapeHTML(m.date || '')} · ${money(m.total)} · ${memoDue(m) > 0 ? 'বাকি ' + money(memoDue(m)) : 'পরিশোধ'}</small></div><div class="row-actions"><button type="button" class="small-action" data-open-memo="${escapeHTML(m.id)}">বিস্তারিত</button>${hasAdminAccess('memosAdmin') ? `<button type="button" class="small-action danger" data-delete-memo="${escapeHTML(m.id)}">মুছুন</button>` : ''}</div></div>`).join('') || '<div class="empty-state">এখনো কোনো মেমো তৈরি হয়নি।</div>';
  list.querySelectorAll('[data-open-memo]').forEach(btn => btn.addEventListener('click', () => showAdminMemo(btn.dataset.openMemo)));
  list.querySelectorAll('[data-delete-memo]').forEach(btn => btn.addEventListener('click', () => deleteMemo(btn.dataset.deleteMemo)));
  bindMemoResultActions($('adminMemoResult'));
}
async function deleteMemo(id) {
  if (!hasAdminAccess('memosAdmin')) return;
  const memo = memos.find(item => String(item.id) === String(id)); if (!memo) return;
  const confirmed = await actionDialog({ title: `মেমো #${memo.id} মুছবেন?`, message: 'মুছে ফেললে এই মেমোর তথ্য আর ফিরিয়ে আনা যাবে না।', submitText: 'মেমো মুছুন', danger: true });
  if (!confirmed) return;
  const updatedMemos = memos.filter(item => String(item.id) !== String(id));
  try {
    save(STORE.memos, updatedMemos);
    memos = updatedMemos;
  } catch {
    toast('মেমো মুছে ফেলা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।');
    return;
  }
  renderMemos();
  if ($('adminMemoSearch').value.trim() === String(id)) $('adminMemoResult').innerHTML = '';
  toast(`মেমো #${id} মুছে ফেলা হয়েছে।`);
}
function renderCustomerInfo(selectedKey = '') {
  const list = $('customerInfoList');
  const detail = $('customerInfoDetail');
  if (!list || !detail) return;
  const records = new Map();
  const ensureRecord = (key, phone = '', name = '', address = '') => {
    if (!records.has(key)) records.set(key, { key, phone, name, address, memos: [] });
    const record = records.get(key);
    if (phone) record.phone = phone;
    if (name) record.name = name;
    if (address) record.address = address;
    return record;
  };
  Object.entries(customers || {}).forEach(([phone, customer]) => {
    const key = normalizePhone(phone);
    if (key) ensureRecord(key, phone, customer?.name || '', customer?.address || '');
  });
  memos.forEach(memo => {
    const phone = String(memo.phone || '').trim();
    const identity = normalizePhone(phone) || `no-phone:${String(memo.customerName || '').trim().toLowerCase()}|${String(memo.address || '').trim().toLowerCase()}`;
    const key = identity === 'no-phone:|' ? `memo:${memo.id}` : identity;
    ensureRecord(key, phone, memo.customerName || '', memo.address || '').memos.push(memo);
  });
  const entries = [...records.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'bn'));
  list.innerHTML = entries.map(customer => `<div class="admin-list-row"><div><strong>${escapeHTML(customer.name || 'নাম দেওয়া হয়নি')}</strong><small>${escapeHTML(customer.phone || 'ফোন নেই')} · ${customer.memos.length.toLocaleString('bn-BD')}টি মেমো</small></div><button type="button" class="small-action" data-view-customer="${escapeHTML(customer.key)}">বিস্তারিত</button></div>`).join('') || '<div class="empty-state">এখনো কোনো গ্রাহকের তথ্য নেই।</div>';
  list.querySelectorAll('[data-view-customer]').forEach(button => button.addEventListener('click', () => renderCustomerInfo(button.dataset.viewCustomer)));
  const customer = entries.find(item => item.key === selectedKey);
  if (!customer) {
    detail.innerHTML = '<div class="empty-state">বিস্তারিত দেখতে গ্রাহক নির্বাচন করুন।</div>';
    return;
  }
  const memoDetails = customer.memos.slice().reverse().map(memo => {
    const history = Array.isArray(memo.paymentHistory) ? memo.paymentHistory : [];
    const payments = history.length ? `<div class="customer-payment-history"><strong>জমার বিবরণ</strong>${history.map(payment => `<div><span>${escapeHTML(payment.date || '')}${payment.receivedBy ? ` · ${escapeHTML(payment.receivedBy)}` : ''}</span><strong>${money(payment.amount)}</strong></div>`).join('')}</div>` : '';
    return `${memoCard(memo)}${payments}`;
  }).join('');
  detail.innerHTML = `<section class="customer-profile"><h3>${escapeHTML(customer.name || 'নাম দেওয়া হয়নি')}</h3><div><span>ফোন নম্বর</span><strong>${escapeHTML(customer.phone || 'দেওয়া হয়নি')}</strong></div><div><span>ঠিকানা</span><strong>${escapeHTML(customer.address || 'দেওয়া হয়নি')}</strong></div><div><span>মোট মেমো</span><strong>${customer.memos.length.toLocaleString('bn-BD')}</strong></div>${customer.memos.length ? `<div><span>সর্বশেষ মেমো</span><strong>${escapeHTML(customer.memos[customer.memos.length - 1].date || 'দেওয়া হয়নি')}</strong></div>` : ''}</section><h3 class="customer-memos-heading">মেমোর তথ্য</h3>${memoDetails || '<div class="empty-state">এই গ্রাহকের কোনো মেমো নেই।</div>'}`;
}
async function collectMemoPayment(id, publicFlow = false) {
  if (!hasAdminAccess('payMemos')) { toast('এই অ্যাডমিনের মেমো পরিশোধের অনুমতি নেই।'); return; }
  const memo = memos.find(item => String(item.id) === String(id));
  if (!memo) return;
  const due = memoDue(memo);
  if (due <= 0) return;
  const response = await actionDialog({
    title: 'বাকি টাকা জমা নিন', message: 'গ্রাহকের নাম, নেওয়া পণ্য ও বাকি টাকা দেখুন। পেমেন্ট সংরক্ষণ করলে পুরো বাকি টাকা পরিশোধ হিসেবে নথিভুক্ত হবে।', submitText: 'পেমেন্ট সংরক্ষণ',
    fields: [
      { name: 'customerName', label: 'গ্রাহকের নাম', value: memo.customerName || 'নাম দেওয়া হয়নি', readonly: true },
      ...(memo.items || []).map((item, index) => ({
        name: `product${index}`,
        label: `নেওয়া পণ্য ${index + 1}: ${item.name}`,
        value: `${Number(item.quantity || 0).toLocaleString('bn-BD')} কেজি × ${money(item.price)} = ${money(Number(item.quantity || 0) * Number(item.price || 0))}`,
        readonly: true,
        required: false
      })),
      { name: 'due', label: 'বাকির পরিমাণ', type: 'number', value: String(due), readonly: true, step: '0.01' },
      { name: 'receivedBy', label: 'টাকা গ্রহণকারীর নাম', value: activeAdmin?.name || '' }
    ]
  });
  if (!response) return;
  const amount = due;
  const discount = 0;
  const receivedBy = response.receivedBy.trim();
  const previous = { advance: memo.advance, discount: memo.discount, due: memo.due, paidBy: memo.paidBy, updatedAt: memo.updatedAt, paymentHistory: memo.paymentHistory };
  memo.discount = Number(memo.discount || 0) + discount;
  memo.advance = Math.min(memo.total - memo.discount, Number(memo.advance || 0) + amount);
  memo.due = Math.max(0, memo.total - memo.discount - memo.advance);
  if (amount > 0) {
    memo.paidBy = receivedBy || activeAdmin?.name || '';
    memo.paymentHistory = [...(Array.isArray(memo.paymentHistory) ? memo.paymentHistory : []), { date: new Date().toLocaleDateString('bn-BD'), amount, receivedBy: memo.paidBy }];
  }
  memo.updatedAt = new Date().toLocaleString('bn-BD');
  try { save(STORE.memos, memos); }
  catch {
    Object.assign(memo, previous);
    toast('পেমেন্ট সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।');
    return;
  }
  renderMemos();
  if (publicFlow) {
    closeAdmin();
    publicMemoSearch(memo.id);
  } else {
    showAdminMemo(memo.id);
    if (memoDue(memo) <= 0) setTimeout(() => printMemo(memo.id), 150);
  }
  toast('মেমোর পেমেন্ট আপডেট হয়েছে।');
}
function bindMemoResultActions(container) {
  container.querySelectorAll('[data-pay-memo]').forEach(btn => btn.addEventListener('click', () => {
    if (!hasAdminAccess('payMemos')) return;
    collectMemoPayment(btn.dataset.payMemo);
  }));
  container.querySelectorAll('[data-print-memo]').forEach(btn => btn.addEventListener('click', () => { if (hasAdminAccess('memosAdmin')) printMemo(btn.dataset.printMemo); }));
  container.querySelectorAll('[data-edit-memo]').forEach(btn => btn.addEventListener('click', () => { if (hasAdminAccess('memosAdmin')) updateMemoInfo(btn.dataset.editMemo); }));
}
function showAdminMemo(id) {
  const memo = memos.find(m => String(m.id) === String(id)); if (!memo) return;
  $('adminMemoResult').innerHTML = memoCard(memo, true); bindMemoResultActions($('adminMemoResult'));
}
async function updateMemoInfo(id) {
  if (!hasAdminAccess('memosAdmin')) return;
  const memo = memos.find(m => String(m.id) === String(id)); if (!memo) return;
  const response = await actionDialog({
    title: `মেমো #${memo.id} তথ্য আপডেট`,
    message: 'কাস্টমারের নাম, ফোন নম্বর ও ঠিকানা পরিবর্তন করুন।',
    submitText: 'তথ্য সংরক্ষণ করুন',
    fields: [
      { name: 'name', label: 'কাস্টমারের নাম', value: memo.customerName || '', required: false },
      { name: 'phone', label: 'কাস্টমারের ফোন নম্বর', type: 'tel', value: memo.phone || '', required: false },
      { name: 'address', label: 'কাস্টমারের ঠিকানা', value: memo.address || '', required: false },
      { name: 'due', label: 'বাকি টাকা', type: 'number', value: String(memoDue(memo)), readonly: true, step: '0.01' },
      { name: 'paymentStatus', label: 'পেমেন্টের অবস্থা', value: memoDue(memo) > 0 ? 'due' : 'paid', options: [
        { value: 'paid', label: 'পরিশোধ হয়েছে' },
        { value: 'due', label: 'পরিশোধ হয়নি' }
      ] }
    ]
  });
  if (!response) return;
  const oldMemo = { customerName: memo.customerName, address: memo.address, phone: memo.phone, advance: memo.advance, due: memo.due };
  const customerKey = normalizePhone(response.phone);
  const oldCustomer = customerKey ? customers[customerKey] : undefined;
  memo.customerName = response.name.trim();
  memo.address = response.address.trim();
  memo.phone = response.phone.trim();
  const balanceAfterDiscount = Math.max(0, Number(memo.total || 0) - Number(memo.discount || 0));
  memo.advance = response.paymentStatus === 'paid'
    ? balanceAfterDiscount
    : (memoDue(memo) <= 0 ? 0 : Number(memo.advance || 0));
  memo.due = Math.max(0, balanceAfterDiscount - memo.advance);
  if (customerKey) customers[customerKey] = { name: memo.customerName, address: memo.address };
  try {
    save(STORE.memos, memos);
    save(STORE.customers, customers);
    renderMemos(); showAdminMemo(memo.id); renderCustomerInfo(); toast('মেমোর তথ্য আপডেট হয়েছে।');
  } catch {
    Object.assign(memo, oldMemo);
    if (customerKey) {
      if (oldCustomer) customers[customerKey] = oldCustomer;
      else delete customers[customerKey];
    }
    try { save(STORE.memos, memos); save(STORE.customers, customers); } catch {}
    toast('তথ্য সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।');
  }
}
function publicMemoSearch(id) {
  const memo = memos.find(m => String(m.id).toLowerCase() === String(id).trim().toLowerCase());
  if (!memo) {
    $('publicMemoResult').innerHTML = '<span class="not-found">এই নম্বরে কোনো মেমো পাওয়া যায়নি।</span>';
    return;
  }
  const due = memoDue(memo);
  const items = (memo.items || []).map(item => `<div class="public-memo-item"><span>${escapeHTML(item.name)} · ${Number(item.quantity || 0).toLocaleString('bn-BD')} কেজি</span><strong>${money(Number(item.quantity || 0) * Number(item.price || 0))}</strong></div>`).join('');
  $('publicMemoResult').innerHTML = `<article class="public-result-card"><div class="public-memo-heading"><strong>মেমো #${escapeHTML(memo.id)}</strong><span class="status-pill ${due > 0 ? 'status-due' : 'status-paid'}">${due > 0 ? 'পরিশোধ হয়নি' : 'পরিশোধ হয়েছে'}</span></div><div class="public-memo-details"><div><span>কাস্টমারের নাম</span><strong>${escapeHTML(memo.customerName || 'নাম দেওয়া হয়নি')}</strong></div><div><span>ফোন নম্বর</span><strong>${escapeHTML(memo.phone || 'দেওয়া হয়নি')}</strong></div><div class="public-memo-address"><span>ঠিকানা</span><strong>${escapeHTML(memo.address || 'দেওয়া হয়নি')}</strong></div></div><div class="public-memo-items">${items || '<div>পণ্যের তথ্য নেই</div>'}</div><div class="public-memo-totals"><div><span>মোট ক্রয়</span><strong>${money(memo.total)}</strong></div><div><span>অগ্রিম জমা</span><strong>${money(memo.advance)}</strong></div><div><span>ডিসকাউন্ট</span><strong>${money(memo.discount)}</strong></div><div class="public-memo-due"><span>${due > 0 ? 'বাকি' : 'বাকি নেই'}</span><strong>${money(due)}</strong></div></div>${due > 0 ? '<button type="button" class="button button-primary public-pay-button" id="publicPayButton">বাকি পরিশোধ</button>' : ''}</article>`;
  const payButton = $('publicPayButton');
  if (payButton) payButton.addEventListener('click', () => {
    pendingPublicPaymentMemoId = String(memo.id);
    showLogin();
    $('loginMessage').textContent = 'এই মেমোর পেমেন্ট করতে অনুমতিপ্রাপ্ত অ্যাডমিন দিয়ে লগইন করুন।';
  });
}
function qrCodeDataUrl(text) {
  const versions = [
    { data: 19, ecc: 7 }, { data: 34, ecc: 10 },
    { data: 55, ecc: 15 }, { data: 80, ecc: 20 }
  ];
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = versions.findIndex(info => 12 + bytes.length * 8 <= info.data * 8);
  if (version < 0) return '';
  const versionNumber = version + 1;
  const info = versions[version];
  const bits = [];
  const appendBits = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  appendBits(4, 4);
  appendBits(bytes.length, 8);
  bytes.forEach(byte => appendBits(byte, 8));
  for (let i = 0; i < Math.min(4, info.data * 8 - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  for (let pad = 0; data.length < info.data; pad++) data.push(pad % 2 ? 0x11 : 0xec);

  const multiply = (left, right) => {
    let result = 0;
    while (right) {
      if (right & 1) result ^= left;
      left <<= 1;
      if (left & 0x100) left ^= 0x11d;
      right >>>= 1;
    }
    return result;
  };
  let generator = [1];
  for (let i = 0, root = 1; i < info.ecc; i++, root = multiply(root, 2)) {
    const next = Array(generator.length + 1).fill(0);
    generator.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= multiply(coefficient, root);
    });
    generator = next;
  }
  const remainder = [...data, ...Array(info.ecc).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = remainder[i];
    generator.forEach((coefficient, index) => { remainder[i + index] ^= multiply(coefficient, factor); });
  }
  const codewords = [...data, ...remainder.slice(data.length)];
  const size = 17 + versionNumber * 4;
  const matrix = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const setFunction = (row, col, dark) => {
    if (row >= 0 && row < size && col >= 0 && col < size) {
      matrix[row][col] = dark;
      reserved[row][col] = true;
    }
  };
  const finder = (centerRow, centerCol) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      setFunction(centerRow + dy, centerCol + dx, distance !== 2 && distance <= 3);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  if (versionNumber > 1) {
    const center = 10 + versionNumber * 4;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(center + dy, center + dx, distance !== 1);
    }
  }
  // Reserve both copies of the format information (error correction level L, mask 0).
  for (let i = 0; i <= 5; i++) setFunction(i, 8, false);
  setFunction(7, 8, false); setFunction(8, 8, false); setFunction(8, 7, false);
  for (let i = 9; i < 15; i++) setFunction(8, 14 - i, false);
  for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, false);
  for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, false);
  setFunction(size - 8, 8, true);

  const stream = codewords.flatMap(byte => Array.from({ length: 8 }, (_, bit) => (byte >>> (7 - bit)) & 1));
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      const row = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset++) {
        const col = right - offset;
        if (reserved[row][col]) continue;
        const bit = bitIndex < stream.length ? stream[bitIndex++] : 0;
        matrix[row][col] = (row + col) % 2 === 0 ? !bit : !!bit;
      }
    }
  }
  let format = 8; // L-level format bits with mask pattern 0.
  let remainderBits = format << 10;
  for (let i = 14; i >= 10; i--) if ((remainderBits >>> i) & 1) remainderBits ^= 0x537 << (i - 10);
  format = ((format << 10) | remainderBits) ^ 0x5412;
  for (let i = 0; i <= 5; i++) matrix[i][8] = ((format >>> i) & 1) !== 0;
  matrix[7][8] = ((format >>> 6) & 1) !== 0;
  matrix[8][8] = ((format >>> 7) & 1) !== 0;
  matrix[8][7] = ((format >>> 8) & 1) !== 0;
  for (let i = 9; i < 15; i++) matrix[8][14 - i] = ((format >>> i) & 1) !== 0;
  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = ((format >>> i) & 1) !== 0;
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = ((format >>> i) & 1) !== 0;
  matrix[size - 8][8] = true;

  const quiet = 4;
  const path = [];
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) path.push(`M${x + quiet},${y + quiet}h1v1h-1z`);
  }));
  const dimension = size + quiet * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path.join('')}" fill="black"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function printMemo(id, previewOnly = false) {
  const memo = previewOnly && pendingMemo && String(pendingMemo.id) === String(id) ? pendingMemo : memos.find(m => String(m.id) === String(id));
  if (!memo) return;
  const memoUrl = new URL(window.location.href);
  memoUrl.hash = `memo=${encodeURIComponent(memo.id)}`;
  const qrImage = qrCodeDataUrl(memoUrl.href);
  let area = $('printArea'); if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = `<div class="print-bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div><h1 class="print-title">জিহান মৎস্য বীজাগার</h1><div class="print-address">জগন্নাথপুর (হাজির বাজার), মোকামতলা, বগুড়া-৫৮১০</div><div class="print-address">ফোন: +8801722736633, +8801711428073</div><div class="print-director">পরিচালক: মোঃ ময়নুল সাদিক (জোহা)</div><div class="print-director">এখানে উন্নতমানের রুই, মৃগেল, কাতলা, বাটা, সীলভার, গ্লাসকাপ, স্বরপুটি, পাঙ্গাস, হাংরি, দেশী মাগুর, কৈ, টেংরা, গুলশা, পাবদা মাছের রেনু পোনা পাওয়া যায়</div><hr class="print-rule"><div class="print-memo-head"><div class="print-memo-id">মেমো নং: ${escapeHTML(memo.id)}</div><div class="print-date">তারিখ: ${escapeHTML(memo.date)}</div><div class="print-created">তৈরি করেছেন: ${escapeHTML(memo.createdBy)}</div><div class="print-status">${memoDue(memo) > 0 ? 'বাকি' : 'পরিশোধ'}</div>${qrImage ? `<div class="print-qr"><img src="${escapeHTML(qrImage)}" alt="মেমো দেখার QR কোড"><small>স্ক্যান করে মেমো দেখুন</small></div>` : ''}</div><div class="print-customer"><strong>নাম:</strong> ${escapeHTML(memo.customerName || '—')}<br><strong>ঠিকানা:</strong> ${escapeHTML(memo.address || '—')}<br><strong>ফোন:</strong> ${escapeHTML(memo.phone || '—')}</div><table class="print-table"><thead><tr><th>পণ্যের নাম</th><th>পরিমাণ</th><th>দর</th><th>টাকা</th></tr></thead><tbody>${memo.items.map(item => `<tr><td>${escapeHTML(item.name)}</td><td>${item.quantity.toLocaleString('bn-BD')} কেজি</td><td>${money(item.price)}</td><td>${money(item.quantity * item.price)}</td></tr>`).join('')}</tbody></table><div class="print-totals"><div><span>সর্বমোট</span><strong>${money(memo.total)}</strong></div><div><span>অগ্রিম জমা</span><strong>${money(memo.advance)}</strong></div><div><span>ডিসকাউন্ট</span><strong>${money(memo.discount)}</strong></div><div class="grand"><span>বাকি</span><strong>${money(memoDue(memo))}</strong></div></div>${memo.paidBy ? `<div class="print-user">পরিশোধ গ্রহণকারী: ${escapeHTML(memo.paidBy)}</div>` : ''}<div class="print-thanks">ইনশাল্লাহ আবার আসবেন</div><div class="print-footer">এখানে মাছের খাদ্যদ্রব্য মাছের ফিট ঔষধ মাছের যাবতীয় জিনিসপত্র পাওয়া যায় ।</div>`;
  if (previewOnly) {
    $('memoPreview').innerHTML = area.innerHTML;
    $('memoPreview').classList.remove('hidden');
    return;
  }
  document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500);
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = () => {
      const image = new Image(); image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .76));
      }; image.src = reader.result;
    }; reader.readAsDataURL(file);
  });
}
async function selectedImage(fileInput, urlInput, current = '') {
  const file = fileInput.files?.[0];
  if (file) return await compressImage(file);
  return urlInput.value.trim() || current;
}

function createAndSaveMemo(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!hasAdminAccess('memoAdmin')) return;
  if (!selectedItems.length) { toast('মেমোর জন্য অন্তত একটি পণ্য যোগ করুন।'); return; }

  const subtotal = selectedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discount = Math.min(subtotal, Math.max(0, Number($('discountAmount').value) || 0));
  const balanceAfterDiscount = Math.max(0, subtotal - discount);
  const advanceValue = $('advanceAmount').value.trim();
  const advanceInput = advanceValue ? Number(advanceValue.replace(',', '.')) : 0;
  if (!Number.isFinite(advanceInput) || advanceInput < 0 || advanceInput > balanceAfterDiscount) {
    toast('বাকি টাকার মধ্যে সঠিক জমার পরিমাণ লিখুন।');
    return;
  }

  const id = nextMemoNumber();
  const memo = {
    id, date: new Date().toLocaleDateString('bn-BD'),
    customerName: $('customerName').value.trim(),
    phone: $('customerPhone').value.trim(),
    address: $('customerAddress').value.trim(),
    items: selectedItems.map(item => ({ ...item })),
    total: subtotal, discount, advance: advanceInput,
    due: Math.max(0, balanceAfterDiscount - advanceInput),
    createdBy: activeAdmin?.name || 'অ্যাডমিন'
  };
  const phoneKey = normalizePhone(memo.phone);
  const updatedCustomers = { ...customers };
  if (phoneKey) updatedCustomers[phoneKey] = { name: memo.customerName, address: memo.address };
  const updatedMemos = [...memos, memo];
  const oldCounter = localStorage.getItem(STORE.counter);
  try {
    save(STORE.memos, updatedMemos);
    save(STORE.customers, updatedCustomers);
    localStorage.setItem(STORE.counter, String(id + 1));
  } catch {
    try {
      save(STORE.memos, memos);
      save(STORE.customers, customers);
      if (oldCounter === null) localStorage.removeItem(STORE.counter);
      else localStorage.setItem(STORE.counter, oldCounter);
    } catch {}
    toast('মেমো সেভ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।');
    return;
  }

  memos = updatedMemos;
  customers = updatedCustomers;
  lastSavedMemoId = String(id);
  pendingMemo = null;
  selectedItems = [];
  $('customerPhone').value = '';
  $('customerName').value = '';
  $('customerAddress').value = '';
  $('advanceAmount').value = '';
  $('discountAmount').value = '0';
  $('paymentStatus').value = 'paid';
  renderSelectedItems();
  $('saveMemoButton').disabled = false;
  printMemo(id, true);
  renderPicker();
  if (activeAdmin) {
    renderMemos();
    renderAdminWorkReport();
    renderCustomerInfo();
    showAdminMemo(id);
  }
  $('memoSaveStatus').textContent = 'মেমো সেভ হয়েছে।';
  toast('মেমো সেভ হয়েছে।');
}

$('createMemoButton').addEventListener('click', createAndSaveMemo, true);
$('saveMemoButton').addEventListener('click', event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (lastSavedMemoId) printMemo(lastSavedMemoId);
}, true);

$('year').textContent = new Date().getFullYear().toLocaleString('bn-BD');
renderHomepage();
$('menuToggle').addEventListener('click', () => $('mainNav').classList.toggle('open'));
document.querySelectorAll('.main-nav a').forEach(link => link.addEventListener('click', () => $('mainNav').classList.remove('open')));
$('adminOpen').addEventListener('click', () => { pendingPublicPaymentMemoId = null; showLogin(); });
$('dueCustomersPrintButton').addEventListener('click', () => {
  if (!hasAdminAccess('dueCustomersAdmin')) return;
  document.body.classList.add('debt-printing');
  window.print();
  setTimeout(() => document.body.classList.remove('debt-printing'), 500);
});
$('adminClose').addEventListener('click', closeAdmin);
$('adminModal').addEventListener('click', event => { if (event.target === $('adminModal')) closeAdmin(); });
$('loginForm').addEventListener('submit', event => {
  event.preventDefault(); const user = $('loginUser').value.trim(); const pass = $('loginPass').value;
  const match = admins.find(admin => admin && String(admin.user).trim().toLowerCase() === user.toLowerCase() && String(admin.pass) === pass);
  if (!match) { $('loginMessage').textContent = 'ইউজার আইডি অথবা পাসওয়ার্ড সঠিক নয়।'; return; }
  if (pendingPublicPaymentMemoId && !adminPermissions(match).includes('payMemos')) {
    $('loginMessage').textContent = 'এই অ্যাডমিনের মেমো পরিশোধের অনুমতি নেই।';
    return;
  }
  activeAdmin = match;
  if (pendingPublicPaymentMemoId) {
    const memoId = pendingPublicPaymentMemoId;
    pendingPublicPaymentMemoId = null;
    showAdmin();
    collectMemoPayment(memoId, true);
    return;
  }
  showAdmin();
});
$('logoutButton').addEventListener('click', () => { activeAdmin = null; showLogin(); $('loginForm').reset(); });
document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.admin-tab').forEach(item => item.classList.toggle('active', item === tab));
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('active', panel.id === tab.dataset.panel));
  if (tab.dataset.panel === 'memosAdmin') renderMemos();
  if (tab.dataset.panel === 'adminReportsAdmin') renderAdminWorkReport();
  if (tab.dataset.panel === 'customerInfoAdmin') renderCustomerInfo();
}));
$('newProductButton').addEventListener('click', () => { if (!hasAdminAccess('productsAdmin')) return; $('productForm').reset(); $('productId').value = ''; $('productFormTitle').textContent = 'নতুন পণ্য যোগ'; $('productForm').classList.remove('hidden'); $('productForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('cancelProduct').addEventListener('click', () => $('productForm').classList.add('hidden'));
$('productForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!hasAdminAccess('productsAdmin')) return;
  const id = $('productId').value; const old = products.find(p => p.id === id);
  try {
    const image = await selectedImage($('productImageFile'), $('productImage'), old?.image || '');
    const item = { id: id || `product-${Date.now()}`, name: $('productName').value.trim(), price: Number($('productPrice').value), image, description: $('productDescription').value.trim() };
    if (id) products = products.map(p => p.id === id ? item : p); else products.push(item);
    save(STORE.products, products); $('productForm').reset(); $('productId').value = ''; $('productForm').classList.add('hidden');
    renderAdminProducts(); renderHomepage(); renderPicker(); toast('পণ্য সংরক্ষণ হয়েছে।');
  } catch { toast('ছবিটি পড়া যায়নি। অন্য ছবি নির্বাচন করুন।'); }
});
$('advanceAmount').addEventListener('input', () => { invalidateMemoDraft(); updateMemoTotal(); });
$('discountAmount').addEventListener('input', () => { invalidateMemoDraft(); updateMemoTotal(); });
$('paymentStatus').addEventListener('change', () => {
  if ($('paymentStatus').value === 'due') $('advanceAmount').value = '';
  invalidateMemoDraft(); updateMemoTotal();
});
['customerPhone', 'customerName', 'customerAddress'].forEach(id => $(id).addEventListener('input', invalidateMemoDraft));
$('customerPhone').addEventListener('change', event => fillCustomer(event.target.value));
$('customerPhone').addEventListener('blur', event => fillCustomer(event.target.value));
$('createMemoButton').addEventListener('click', () => {
  if (!hasAdminAccess('memoAdmin')) return;
  if (!selectedItems.length) { toast('মেমোর জন্য অন্তত একটি পণ্য যোগ করুন।'); return; }
  const phone = $('customerPhone').value.trim(); const name = $('customerName').value.trim(); const address = $('customerAddress').value.trim();
  const total = selectedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discount = Math.min(total, Math.max(0, Number($('discountAmount').value) || 0));
  const balanceAfterDiscount = Math.max(0, total - discount);
  const advance = $('paymentStatus').value === 'paid'
    ? balanceAfterDiscount
    : Math.min(balanceAfterDiscount, Math.max(0, Number($('advanceAmount').value) || 0));
  const due = Math.max(0, balanceAfterDiscount - advance);
  const memoDate = new Date().toLocaleDateString('bn-BD');
  pendingMemo = { id: nextMemoNumber(), date: memoDate, createdBy: activeAdmin?.name || 'অ্যাডমিন', phone, customerName: name, address, items: selectedItems.map(item => ({ ...item })), total, advance, discount, due, paidBy: '', paymentHistory: advance > 0 ? [{ date: memoDate, amount: advance, receivedBy: activeAdmin?.name || 'অ্যাডমিন' }] : [] };
  $('saveMemoButton').disabled = false;
  $('memoSaveStatus').textContent = 'মেমো তৈরি হয়েছে—প্রিভিউ দেখুন।';
  printMemo(pendingMemo.id, true);
});
$('saveMemoButton').addEventListener('click', () => {
  if (!hasAdminAccess('memoAdmin')) return;
  if (!pendingMemo) { toast('মেমো আগে তৈরি করুন।'); return; }
  const memo = pendingMemo;
  const updatedMemos = [...memos, memo];

  // Save the memo first; customer history and the counter are supplementary.
  try {
    save(STORE.memos, updatedMemos);
  } catch {
    toast('মেমো সেভ করা যায়নি। ব্রাউজারের স্টোরেজ খালি করে আবার চেষ্টা করুন।');
    return;
  }

  memos = updatedMemos;
  pendingMemo = null;
  if (memo.phone) {
    const updatedCustomers = { ...customers, [normalizePhone(memo.phone)]: { name: memo.customerName, address: memo.address } };
    try { save(STORE.customers, updatedCustomers); customers = updatedCustomers; } catch {}
  }
  try { localStorage.setItem(STORE.counter, String(Number(memo.id) + 1)); } catch {}

  $('customerPhone').value = ''; $('customerName').value = ''; $('customerAddress').value = '';
  $('advanceAmount').value = ''; $('discountAmount').value = '0'; $('paymentStatus').value = 'paid';
  $('memoSaveStatus').textContent = '';
  $('saveMemoButton').disabled = true;
  $('memoPreview').classList.add('hidden');
  $('memoPreview').innerHTML = '';
  selectedItems = [];
  renderSelectedItems(); renderPicker(); renderMemos(); showAdminMemo(memo.id);
  toast(`মেমো #${memo.id} সেভ হয়েছে।`);
  printMemo(memo.id);
});

$('adminSearchForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!activeAdmin) return;
  const id = $('adminMemoSearch').value.trim();
  if (memos.some(memo => String(memo.id) === id)) showAdminMemo(id);
  else $('adminMemoResult').innerHTML = '<div class="empty-state">এই নম্বরে কোনো মেমো পাওয়া যায়নি।</div>';
});
$('publicSearchForm').addEventListener('submit', event => { event.preventDefault(); publicMemoSearch($('publicMemoId').value); });
const linkedMemoId = new URLSearchParams(window.location.hash.slice(1)).get('memo');
if (linkedMemoId) {
  $('publicMemoId').value = linkedMemoId;
  publicMemoSearch(linkedMemoId);
  $('memoSearch').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('adminCreateForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!hasAdminAccess('adminsAdmin')) return;
  const name = $('newAdminName').value.trim();
  const user = $('newAdminUser').value.trim();
  const pass = $('newAdminPass').value;
  const permissions = [...document.querySelectorAll('input[name="adminPermission"]:checked')].map(input => input.value);
  if (!name || !user || !pass.trim()) { toast('নাম, ইউজার আইডি ও পাসওয়ার্ড পূরণ করুন।'); return; }
  if (!permissions.length) { toast('নতুন অ্যাডমিনের জন্য অন্তত একটি অ্যাক্সেস নির্বাচন করুন।'); return; }
  if (admins.some(admin => admin && String(admin.user || '').trim().toLowerCase() === user.toLowerCase())) { toast('এই ইউজার আইডি আগে থেকেই আছে।'); return; }
  const newAdmin = { name, user, pass, permissions };
  admins.push(newAdmin);
  try {
    save(STORE.admins, admins);
    event.target.reset(); renderAdminAccounts(); toast('নতুন অ্যাডমিন যুক্ত হয়েছে।');
  } catch {
    admins.pop(); toast('অ্যাডমিন সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।');
  }
});
$('siteSettingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!hasAdminAccess('siteAdmin')) return;
  try {
    settings.language = $('siteDefaultLanguage').value;
    settings.heroTitle = $('settingHeroTitle').value.trim(); settings.heroText = $('settingHeroText').value.trim();
    settings.heroImage = await selectedImage($('settingHeroImageFile'), $('settingHeroImage'), settings.heroImage);
    settings.adviceTitle = $('settingAdviceTitle').value.trim(); settings.adviceText = $('settingAdviceText').value.trim();
    for (let i = 0; i < 3; i++) settings.gallery[i] = await selectedImage($(`galleryFile${i + 1}`), $(`galleryImage${i + 1}`), settings.gallery[i] || '');
    const publicCopy = {};
    $('publicCopyEditor').querySelectorAll('[data-public-copy]').forEach(input => {
      const entry = publicTextNodes.find(item => item.key === input.dataset.publicCopy);
      const value = input.value;
      if (entry && value !== entry.original.trim()) publicCopy[entry.key] = value;
    });
    settings.publicCopy = publicCopy;
    save(STORE.settings, settings);
    siteLanguage = settings.language || siteLanguage;
    localStorage.setItem('jihan_site_language', siteLanguage);
    renderHomepage(); applyLanguage(); toast('হোমপেজ আপডেট হয়েছে।');
  } catch { toast('ছবিটি পড়া যায়নি। অন্য ছবি নির্বাচন করুন।'); }
});
$('publicLanguage').addEventListener('change', event => {
  siteLanguage = event.target.value;
  localStorage.setItem('jihan_site_language', siteLanguage);
  applyLanguage();
});
$('adminLanguage').addEventListener('change', event => {
  adminPanelLanguage = event.target.value;
  localStorage.setItem('jihan_admin_language', adminPanelLanguage);
  applyLanguage();
});
$('siteDefaultLanguage').addEventListener('change', event => {
  if (!hasAdminAccess('siteAdmin')) return;
  settings.language = event.target.value;
  siteLanguage = settings.language;
  localStorage.setItem('jihan_site_language', siteLanguage);
  try { save(STORE.settings, settings); } catch { toast('ভাষার সেটিং সংরক্ষণ করা যায়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করুন।'); }
  applyLanguage();
});
window.addEventListener('storage', event => {
  if (event.key !== STORE.memos) return;
  memos = read(STORE.memos, []);
  renderMemos();
  renderAdminWorkReport();
  const adminSearch = $('adminMemoSearch').value.trim();
  if (adminSearch && memos.some(memo => String(memo.id) === adminSearch)) showAdminMemo(adminSearch);
  const publicSearch = $('publicMemoId').value.trim();
  if (publicSearch) publicMemoSearch(publicSearch);
});
siteLanguage = siteLanguage === 'en' ? 'en' : 'bn';
adminPanelLanguage = adminPanelLanguage === 'en' ? 'en' : 'bn';
applyLanguage();
new MutationObserver(() => applyLanguage()).observe(document.body, { childList: true, subtree: true, characterData: true });
