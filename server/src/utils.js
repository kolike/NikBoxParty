function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCode(existingCodes) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let attempts = 0;

  while (attempts < 5000) {
    let code = '';
    for (let i = 0; i < 4; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    if (!existingCodes.has(code)) {
      return code;
    }

    attempts += 1;
  }

  throw new Error('Не удалось сгенерировать уникальный код комнаты');
}

module.exports = {
  randomFrom,
  generateCode,
};
