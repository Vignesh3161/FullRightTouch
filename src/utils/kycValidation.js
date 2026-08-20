export const MAX_FILE_SIZE = 5 * 1024 * 1024
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const RULES = {
  aadhaarNumber: (v) => /^\d{12}$/.test(String(v || '').trim()) || 'Aadhaar number must be exactly 12 digits',
  panNumber: (v) =>
    /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(v || '').trim().toUpperCase()) ||
    'PAN must match the format ABCDE1234F',
  drivingLicenseNumber: (v) =>
    !v ||
    /^[A-Z]{2}-?\d{2}-?\d{4}-?\d{7}$/.test(String(v).trim()) ||
    'Driving license number is not valid (e.g. DL-0420110149646)',
  accountHolderName: (v) =>
    /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(String(v || '').trim()) &&
    String(v || '').trim().length >= 3 ||
    'Account holder name must be at least 3 characters (letters only)',
  bankName: (v) => String(v || '').trim().length >= 3 || 'Bank name must be at least 3 characters',
  accountNumber: (v) => /^\d{9,18}$/.test(String(v || '').trim()) || 'Account number must be 9-18 digits',
  ifscCode: (v) =>
    /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(v || '').trim().toUpperCase()) ||
    'IFSC code must match the format SBIN0001234',
  branchName: (v) => String(v || '').trim().length >= 3 || 'Branch name must be at least 3 characters',
  upiId: (v) => /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/.test(String(v || '').trim()) || 'UPI ID is not valid (e.g. name@bank)'
}

export function validateField(name, value) {
  const rule = RULES[name]
  if (!rule) return ''
  const result = rule(value)
  return typeof result === 'string' ? result : ''
}

export function validateForm(form, fields) {
  const errors = {}
  fields.forEach((name) => {
    const err = validateField(name, form[name])
    if (err) errors[name] = err
  })
  return errors
}

export function validateFile(file) {
  if (!file) return ''
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG or WEBP images are allowed'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File must be smaller than 5 MB'
  }
  return ''
}
