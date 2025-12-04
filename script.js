// Тройной звуковой сигнал
function playTripleBeep() {
    const beepData = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQgAAAABAQEB";
    const beep = new Audio(beepData);

    // Проигрываем 3 раза с задержкой
    beep.play();
    setTimeout(() => new Audio(beepData).play(), 250); 
    setTimeout(() => new Audio(beepData).play(), 500);
}
playTripleBeep();
