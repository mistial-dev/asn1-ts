import { ASN1Element } from "../asn1";
import * as errors from "../errors";
import {
    ASN1Construction,
    ASN1RealEncodingBase,
    ASN1RealEncodingScale,
    ASN1SpecialRealValue,
    ASN1TagClass,
    ASN1UniversalType,
    generalizedTimeRegex,
    LengthEncodingPreference,
    nr1Regex,
    nr2Regex,
    nr3Regex,
    printableStringCharacters,
    utcTimeRegex,
} from "../values";
import { X690Element } from "../x690";

export
class BERElement extends X690Element {
    public static lengthEncodingPreference: LengthEncodingPreference =
        LengthEncodingPreference.definite;

    set boolean (value: boolean) {
        this.value = new Uint8Array(1);
        this.value[0] = (value ? 0xFF : 0x00);
    }

    get boolean (): boolean {
        if (this.construction !== ASN1Construction.primitive) {
            throw new errors.ASN1ConstructionError("BOOLEAN cannot be constructed.");
        }
        if (this.value.length !== 1) throw new errors.ASN1SizeError("BOOLEAN not one byte");
        return (this.value[0] !== 0);
    }

    set bitString (value: boolean[]) {
        if (value.length === 0) this.value = new Uint8Array(0);
        const pre: number[] = [];
        pre.length = ((value.length >>> 3) + ((value.length % 8) ? 1 : 0)) + 1;
        for (let i = 0; i < value.length; i++) {
            if (value[i] === false) continue;
            pre[((i >>> 3) + 1)] |= (0b10000000 >>> (i % 8));
        }
        pre[0] = (8 - (value.length % 8));
        if (pre[0] === 8) pre[0] = 0;
        this.value = new Uint8Array(pre);
    }

    get bitString (): boolean[] {
        if (this.construction === ASN1Construction.primitive) {
            if (this.value.length === 0) {
                throw new errors.ASN1Error("ASN.1 BIT STRING cannot be encoded on zero bytes!");
            }
            if (this.value.length === 1 && this.value[0] !== 0) {
                throw new errors.ASN1Error("ASN.1 BIT STRING encoded with deceptive first byte!");
            }
            if (this.value[0] > 7) {
                throw new errors.ASN1Error("First byte of an ASN.1 BIT STRING must be <= 7!");
            }

            let ret: boolean[] = [];
            for (let i = 1; i < this.value.length; i++) {
                ret = ret.concat([
                    (Boolean(this.value[i] & 0b10000000)),
                    (Boolean(this.value[i] & 0b01000000)),
                    (Boolean(this.value[i] & 0b00100000)),
                    (Boolean(this.value[i] & 0b00010000)),
                    (Boolean(this.value[i] & 0b00001000)),
                    (Boolean(this.value[i] & 0b00000100)),
                    (Boolean(this.value[i] & 0b00000010)),
                    (Boolean(this.value[i] & 0b00000001)),
                ]);
            }
            ret.length -= this.value[0];
            return ret;
        } else {
            if ((this.recursionCount + 1) > BERElement.nestingRecursionLimit) throw new errors.ASN1RecursionError();
            let appendy: boolean[] = [];
            const substrings: BERElement[] = this.sequence;
            substrings.slice(0, (substrings.length - 1)).forEach((substring) => {
                if (
                    substring.construction === ASN1Construction.primitive
                    && substring.value.length > 0
                    && substring.value[0] !== 0x00
                ) {
                    throw new errors.ASN1Error(
                        "Only the last subelement of a constructed BIT STRING may have a non-zero first value byte.",
                    );
                }
            });
            substrings.forEach((substring) => {
                if (substring.tagClass !== this.tagClass) {
                    throw new errors.ASN1ConstructionError("Invalid tag class in recursively-encoded BIT STRING.");
                }
                if (substring.tagNumber !== this.tagNumber) {
                    throw new errors.ASN1ConstructionError("Invalid tag class in recursively-encoded BIT STRING.");
                }
                substring.recursionCount = (this.recursionCount + 1);
                appendy = appendy.concat(substring.bitString);
            });
            return appendy;
        }
    }

    set octetString (value: Uint8Array) {
        this.value = new Uint8Array(value); // Clones it.
    }

    get octetString (): Uint8Array {
        return this.deconstruct("OCTET STRING");
    }

    set objectDescriptor (value: string) {
        this.graphicString = value;
    }

    get objectDescriptor (): string {
        return this.graphicString;
    }

    // Only encodes with seven digits of precision.
    set real (value: number) {
        if (value === 0.0) {
            this.value = new Uint8Array(0); return;
        } else if (isNaN(value)) {
            this.value = new Uint8Array([ ASN1SpecialRealValue.notANumber ]); return;
        } else if (value === -0.0) {
            this.value = new Uint8Array([ ASN1SpecialRealValue.minusZero ]); return;
        } else if (value === Infinity) {
            this.value = new Uint8Array([ ASN1SpecialRealValue.plusInfinity ]); return;
        } else if (value === -Infinity) {
            this.value = new Uint8Array([ ASN1SpecialRealValue.minusInfinity ]); return;
        }
        let valueString: string = value.toFixed(7);
        valueString = (String.fromCharCode(0b00000011) + valueString); // Encodes as NR3
        this.value = (new TextEncoder()).encode(valueString);
    }

    get real (): number {
        if (this.construction !== ASN1Construction.primitive) {
            throw new errors.ASN1ConstructionError("REAL cannot be constructed.");
        }
        if (this.value.length === 0) return 0.0;
        switch (this.value[0] & 0b11000000) {
        case (0b01000000): {
            if (this.value[0] === ASN1SpecialRealValue.notANumber) return NaN;
            if (this.value[0] === ASN1SpecialRealValue.minusZero) return -0.0;
            if (this.value[0] === ASN1SpecialRealValue.plusInfinity) return Infinity;
            if (this.value[0] === ASN1SpecialRealValue.minusInfinity) return -Infinity;
            throw new errors.ASN1UndefinedError("Unrecognized special REAL value!");
        }
        case (0b00000000): {
            let realString: string;
            if (typeof TextEncoder !== "undefined") { // Browser JavaScript
                realString = (new TextDecoder("utf-8")).decode(this.value.slice(1));
            } else if (typeof Buffer !== "undefined") { // NodeJS
                realString = (Buffer.from(this.value.slice(1))).toString("utf-8");
            } else {
                throw new errors.ASN1Error("No ability to decode bytes to string!");
            }
            switch (this.value[0] & 0b00111111) {
            case 1: { // NR1
                if (!nr1Regex.test(realString)) throw new errors.ASN1Error("Malformed NR1 Base-10 REAL");
                return parseFloat(realString);
            }
            case 2: { // NR2
                if (!nr2Regex.test(realString)) throw new errors.ASN1Error("Malformed NR2 Base-10 REAL");
                return parseFloat(realString.replace(",", "."));
            }
            case 3: { // NR3
                if (!nr3Regex.test(realString)) throw new errors.ASN1Error("Malformed NR3 Base-10 REAL");
                return parseFloat(realString.replace(",", "."));
            }
            default:
                throw new errors.ASN1UndefinedError("Undefined Base-10 REAL encoding.");
            }
        }
        case (0b10000000):
        case (0b11000000): {
            const sign: number = ((this.value[0] & 0b01000000) ? -1 : 1);

            const base: number = ((flag: number): number => {
                switch (flag) {
                case (ASN1RealEncodingBase.base2):  return 2;
                case (ASN1RealEncodingBase.base8):  return 8;
                case (ASN1RealEncodingBase.base16): return 16;
                default:
                    throw new errors.ASN1Error("Impossible REAL encoding base encountered.");
                }
            })(this.value[0] & 0b00110000);

            const scale: number = ((flag: number): number => {
                switch (flag) {
                case (ASN1RealEncodingScale.scale0): return 0;
                case (ASN1RealEncodingScale.scale1): return 1;
                case (ASN1RealEncodingScale.scale2): return 2;
                case (ASN1RealEncodingScale.scale3): return 3;
                default:
                    throw new errors.ASN1Error("Impossible REAL encoding scale encountered.");
                }
            })(this.value[0] & 0b00001100);

            let exponent: number;
            let mantissa: number;
            switch (this.value[0] & 0b00000011) { // Exponent encoding
            case (0b00000000): { // On the following octet
                if (this.value.length < 3) throw new errors.ASN1TruncationError("Binary-encoded REAL truncated.");
                exponent = ASN1Element.decodeSignedBigEndianInteger(this.value.subarray(1, 2));
                mantissa = ASN1Element.decodeUnsignedBigEndianInteger(this.value.subarray(2));
                break;
            }
            case (0b00000001): { // On the following two octets
                if (this.value.length < 4) throw new errors.ASN1TruncationError("Binary-encoded REAL truncated.");
                exponent = ASN1Element.decodeSignedBigEndianInteger(this.value.subarray(1, 3));
                mantissa = ASN1Element.decodeUnsignedBigEndianInteger(this.value.subarray(3));
                break;
            }
            case (0b00000010): { // On the following three octets
                if (this.value.length < 5) throw new errors.ASN1TruncationError("Binary-encoded REAL truncated.");
                exponent = ASN1Element.decodeSignedBigEndianInteger(this.value.subarray(1, 4));
                mantissa = ASN1Element.decodeUnsignedBigEndianInteger(this.value.subarray(4));
                break;
            }
            case (0b00000011): { // Complicated.
                if (this.value.length < 3) throw new errors.ASN1TruncationError("Binary-encoded REAL truncated.");
                const exponentLength: number = this.value[1];
                if (this.value.length < (3 + exponentLength)) {
                    throw new errors.ASN1TruncationError("Binary-encoded REAL truncated.");
                }
                exponent = ASN1Element.decodeSignedBigEndianInteger(this.value.subarray(2, (2 + exponentLength)));
                mantissa = ASN1Element.decodeUnsignedBigEndianInteger(this.value.subarray((2 + exponentLength)));
                break;
            }
            default:
                throw new errors.ASN1Error("Impossible binary REAL exponent encoding encountered.");
            }

            return (sign * mantissa * Math.pow(2, scale) * Math.pow(base, exponent));
        }
        default:
            throw new errors.ASN1Error("Impossible REAL format encountered.");
        }
    }

    set utf8String (value: string) {
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(value);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(value, "utf-8");
        }
    }

    get utf8String (): string {
        const valueBytes: Uint8Array = this.deconstruct("UTF8String");
        let ret: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            ret = (new TextDecoder("utf-8")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            ret = (Buffer.from(this.value)).toString("utf-8");
        }
        return ret;
    }

    set sequence (value: BERElement[]) {
        const encodedElements: Uint8Array[] = [];
        value.forEach((element) => {
            encodedElements.push(element.toBytes());
        });
        let totalLength: number = 0;
        encodedElements.forEach((element) => {
            totalLength += element.length;
        });
        const newValue = new Uint8Array(totalLength);
        let currentIndex: number = 0;
        encodedElements.forEach((element) => {
            newValue.set(element, currentIndex);
            currentIndex += element.length;
        });
        this.value = newValue;
        this.construction = ASN1Construction.constructed;
    }

    get sequence (): BERElement[] {
        if (this.construction !== ASN1Construction.constructed) {
            throw new errors.ASN1ConstructionError("SET or SEQUENCE cannot be primitively constructed.");
        }
        const encodedElements: BERElement[] = [];
        if (this.value.length === 0) return [];
        let i: number = 0;
        while (i < this.value.length) {
            const next: BERElement = new BERElement();
            i += next.fromBytes(this.value.slice(i));
            encodedElements.push(next);
        }
        return encodedElements;
    }

    set set (value: BERElement[]) {
        this.sequence = value;
    }

    get set (): BERElement[] {
        return this.sequence;
    }

    set numericString (value: string) {
        for (let i: number = 0; i < value.length; i++) {
            const characterCode: number = value.charCodeAt(i);
            if (!((characterCode >= 0x30 && characterCode <= 0x39) || characterCode === 0x20)) {
                throw new errors.ASN1CharactersError("NumericString can only contain characters 0 - 9 and space.");
            }
        }

        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(value);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(value, "utf-8");
        }
    }

    get numericString (): string {
        const valueBytes: Uint8Array = this.deconstruct("NumericString");
        let ret: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            ret = (new TextDecoder("utf-8")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            ret = (Buffer.from(this.value)).toString("utf-8");
        }
        for (let i: number = 0; i < ret.length; i++) {
            const characterCode: number = ret.charCodeAt(i);
            if (!((characterCode >= 0x30 && characterCode <= 0x39) || characterCode === 0x20)) {
                throw new errors.ASN1CharactersError("NumericString can only contain characters 0 - 9 and space.");
            }
        }
        return ret;
    }

    set printableString (value: string) {
        for (let i: number = 0; i < value.length; i++) {
            if (printableStringCharacters.indexOf(value.charAt(i)) === -1) {
                throw new errors.ASN1CharactersError(
                    `PrintableString can only contain these characters: ${printableStringCharacters}`,
                );
            }
        }

        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(value);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(value, "utf-8");
        }
    }

    get printableString (): string {
        const valueBytes: Uint8Array = this.deconstruct("PrintableString");
        let ret: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            ret = (new TextDecoder("utf-8")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            ret = (Buffer.from(this.value)).toString("utf-8");
        }
        for (let i: number = 0; i < ret.length; i++) {
            if (printableStringCharacters.indexOf(ret.charAt(i)) === -1) {
                throw new errors.ASN1CharactersError(
                    `PrintableString can only contain these characters: ${printableStringCharacters}`,
                );
            }
        }
        return ret;
    }

    set teletexString (value: Uint8Array) {
        this.value = new Uint8Array(value); // Clones it.
    }

    get teletexString (): Uint8Array {
        return this.deconstruct("TeletexString");
    }

    set videotexString (value: Uint8Array) {
        this.value = new Uint8Array(value); // Clones it.
    }

    get videotexString (): Uint8Array {
        return this.deconstruct("VideotexString");
    }

    set ia5String (value: string) {
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(value);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(value, "utf-8");
        }
    }

    get ia5String (): string {
        const valueBytes: Uint8Array = this.deconstruct("IA5String");
        let ret: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            ret = (new TextDecoder("utf-8")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            ret = (Buffer.from(this.value)).toString("utf-8");
        }
        return ret;
    }

    set utcTime (value: Date) {
        let year: string = value.getUTCFullYear().toString();
        year = (year.substring(year.length - 2, year.length)); // Will fail if you supply a <2 digit date.
        const month: string = (value.getUTCMonth() < 9 ? `0${value.getUTCMonth() + 1}` : `${value.getUTCMonth() + 1}`);
        const day: string = (value.getUTCDate() < 10 ? `0${value.getUTCDate()}` : `${value.getUTCDate()}`);
        const hour: string = (value.getUTCHours() < 10 ? `0${value.getUTCHours()}` : `${value.getUTCHours()}`);
        const minute: string = (value.getUTCMinutes() < 10 ? `0${value.getUTCMinutes()}` : `${value.getUTCMinutes()}`);
        const second: string = (value.getUTCSeconds() < 10 ? `0${value.getUTCSeconds()}` : `${value.getUTCSeconds()}`);
        const utcString = `${year}${month}${day}${hour}${minute}${second}Z`;
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(utcString);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(utcString, "utf-8");
        }
    }

    get utcTime (): Date {
        const valueBytes: Uint8Array = this.deconstruct("UTCTime");
        let dateString: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            dateString = (new TextDecoder("utf-8")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            dateString = (Buffer.from(this.value)).toString("utf-8");
        }
        const match: RegExpExecArray | null = utcTimeRegex.exec(dateString);
        if (match === null) throw new errors.ASN1Error("Malformed UTCTime string.");
        if (match.groups === undefined) throw new errors.ASN1Error("Malformed UTCTime string.");
        const ret: Date = new Date();
        let year: number = Number(match[1]);
        year = (year < 70 ? (2000 + year) : (1900 + year));
        const month: number = (Number(match[2]) - 1);
        const date: number = Number(match[3]);
        const hours: number = Number(match[4]);
        const minutes: number = Number(match[5]);
        const seconds: number = Number(match[6]);
        BERElement.validateDateTime("UTCTime", year, month, date, hours, minutes, seconds);
        ret.setUTCFullYear(year);
        ret.setUTCMonth(month);
        ret.setUTCDate(date);
        ret.setUTCHours(hours);
        ret.setUTCMinutes(minutes);
        ret.setUTCSeconds(seconds);
        return ret;
    }

    set generalizedTime (value: Date) {
        const year: string = value.getUTCFullYear().toString();
        const month: string = (value.getUTCMonth() < 9 ? `0${value.getUTCMonth() + 1}` : `${value.getUTCMonth() + 1}`);
        const day: string = (value.getUTCDate() < 10 ? `0${value.getUTCDate()}` : `${value.getUTCDate()}`);
        const hour: string = (value.getUTCHours() < 10 ? `0${value.getUTCHours()}` : `${value.getUTCHours()}`);
        const minute: string = (value.getUTCMinutes() < 10 ? `0${value.getUTCMinutes()}` : `${value.getUTCMinutes()}`);
        const second: string = (value.getUTCSeconds() < 10 ? `0${value.getUTCSeconds()}` : `${value.getUTCSeconds()}`);
        const timeString = `${year}${month}${day}${hour}${minute}${second}Z`;
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(timeString);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(timeString, "utf-8");
        }
    }

    get generalizedTime (): Date {
        const valueBytes: Uint8Array = this.deconstruct("GeneralizedTime");
        let dateString: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            dateString = (new TextDecoder("utf-8")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            dateString = (Buffer.from(this.value)).toString("utf-8");
        }
        const match: RegExpExecArray | null = generalizedTimeRegex.exec(dateString);
        if (match === null) throw new errors.ASN1Error("Malformed GeneralizedTime string.");
        if (match.groups === undefined) throw new errors.ASN1Error("Malformed GeneralizedTime string.");
        const ret: Date = new Date();
        const year: number = Number(match[1]);
        const month: number = (Number(match[2]) - 1);
        const date: number = Number(match[3]);
        const hours: number = Number(match[4]);
        const minutes: number = Number(match[5]);
        const seconds: number = Number(match[6]);
        BERElement.validateDateTime("GeneralizedTime", year, month, date, hours, minutes, seconds);
        ret.setUTCFullYear(year);
        ret.setUTCMonth(month);
        ret.setUTCDate(date);
        ret.setUTCHours(hours);
        ret.setUTCMinutes(minutes);
        ret.setUTCSeconds(seconds);
        return ret;
    }

    set graphicString (value: string) {
        for (let i: number = 0; i < value.length; i++) {
            const characterCode: number = value.charCodeAt(i);
            if (characterCode < 0x20 || characterCode > 0x7E) throw new errors.ASN1CharactersError(
                "GraphicString, VisibleString, or ObjectDescriptor "
                    + "can only contain characters between 0x20 and 0x7E."
            );
        }

        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(value);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(value, "utf-8");
        }
    }

    get graphicString (): string {
        const valueBytes: Uint8Array = this.deconstruct("GraphicString, VisibleString, or ObjectDescriptor");
        let ret: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            ret = (new TextDecoder("utf-8")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            ret = (Buffer.from(this.value)).toString("utf-8");
        }
        for (let i: number = 0; i < ret.length; i++) {
            const characterCode: number = ret.charCodeAt(i);
            if (characterCode < 0x20 || characterCode > 0x7E) {
                throw new errors.ASN1CharactersError(
                    "GraphicString, VisibleString, or ObjectDescriptor "
                    + "can only contain characters between 0x20 and 0x7E."
                );
            }
        }
        return ret;
    }

    set visibleString (value: string) {
        this.graphicString = value;
    }

    get visibleString (): string {
        return this.graphicString;
    }

    set generalString (value: string) {
        for (let i: number = 0; i < value.length; i++) {
            if (value.charCodeAt(i) > 0x7F) {
                throw new errors.ASN1CharactersError("GeneralString can only contain ASCII characters.");
            }
        }
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            this.value = (new TextEncoder()).encode(value);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            this.value = Buffer.from(value, "ascii");
        }
    }

    get generalString (): string {
        const valueBytes: Uint8Array = this.deconstruct("GeneralString");
        let ret: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            ret = (new TextDecoder("windows-1252")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            ret = (Buffer.from(this.value)).toString("ascii");
        }
        for (let i: number = 0; i < ret.length; i++) {
            if (ret.charCodeAt(i) > 0x7F) {
                throw new errors.ASN1CharactersError("GeneralString can only contain ASCII characters.");
            }
        }
        return ret;
    }

    set universalString (value: string) {
        const buf: Uint8Array = new Uint8Array(value.length << 2);
        for (let i: number = 0; i < value.length; i++) {
            buf[(i << 2)]      = value.charCodeAt(i) >>> 24;
            buf[(i << 2) + 1]  = value.charCodeAt(i) >>> 16;
            buf[(i << 2) + 2]  = value.charCodeAt(i) >>> 8;
            buf[(i << 2) + 3]  = value.charCodeAt(i);
        }
        this.value = buf;
    }

    /** NOTE:
     * This might not decode anything above 0xFFFF, because JavaScript
     * natively uses either UCS-2 or UTF-16. If it uses UTF-16 (which
     * most do), it might work, but UCS-2 will definitely not work.
     */
    get universalString (): string {
        const valueBytes: Uint8Array = this.deconstruct("UniversalString");
        if (valueBytes.length % 4) {
            throw new errors.ASN1Error("UniversalString encoded on non-mulitple of four bytes.");
        }
        let ret: string = "";
        for (let i: number = 0; i < valueBytes.length; i += 4) {
            ret += String.fromCharCode(
                (valueBytes[i + 0] << 24)
                + (valueBytes[i + 1] << 16)
                + (valueBytes[i + 2] << 8)
                +  (valueBytes[i + 3] << 0)
            );
        }
        return ret;
    }

    set bmpString (value: string) {
        const buf: Uint8Array = new Uint8Array(value.length << 1);
        for (let i: number = 0, strLen: number = value.length; i < strLen; i++) {
            buf[(i << 1)]      = value.charCodeAt(i) >>> 8;
            buf[(i << 1) + 1]  = value.charCodeAt(i);
        }
        this.value = buf;
    }

    get bmpString (): string {
        const valueBytes: Uint8Array = this.deconstruct("BMPString");
        if (valueBytes.length % 2) throw new errors.ASN1Error("BMPString encoded on non-mulitple of two bytes.");
        let ret: string = "";
        if (typeof TextEncoder !== "undefined") { // Browser JavaScript
            ret = (new TextDecoder("utf-16be")).decode(valueBytes.buffer as ArrayBuffer);
        } else if (typeof Buffer !== "undefined") { // NodeJS
            const swappedEndianness: Uint8Array = new Uint8Array(valueBytes.length);
            for (let i: number = 0; i < valueBytes.length; i += 2) {
                swappedEndianness[i] = valueBytes[i + 1];
                swappedEndianness[i + 1] = valueBytes[i];
            }
            /** REVIEW:
             * Since NodeJS does not have a UTF-16-BE decoder, can we swap
             * every pair of bytes to make it little-endian, then decode
             * using NodeJS's utf-16-le decoder?
             */
            ret = (Buffer.from(swappedEndianness)).toString("utf-16le");
        }
        return ret;
    }

    constructor
    (
        tagClass: ASN1TagClass = ASN1TagClass.universal,
        construction: ASN1Construction = ASN1Construction.primitive,
        tagNumber: number = 0
    ) {
        super();
        this.tagClass = tagClass;
        this.construction = construction;
        this.tagNumber = tagNumber;
        this.value = new Uint8Array(0);
    }

    // Returns the number of bytes read
    public fromBytes (bytes: Uint8Array): number {
        if (bytes.length < 2) {
            throw new errors.ASN1TruncationError("Tried to decode a BER element that is less than two bytes.");
        }
        if ((this.recursionCount + 1) > BERElement.nestingRecursionLimit) throw new errors.ASN1RecursionError();
        let cursor: number = 0;
        switch (bytes[cursor] & 0b11000000) {
        case (0b00000000): this.tagClass = ASN1TagClass.universal; break;
        case (0b01000000): this.tagClass = ASN1TagClass.application; break;
        case (0b10000000): this.tagClass = ASN1TagClass.context; break;
        case (0b11000000): this.tagClass = ASN1TagClass.private; break;
        default: this.tagClass = ASN1TagClass.universal;
        }
        this.construction = ((bytes[cursor] & 0b00100000)
            ? ASN1Construction.constructed : ASN1Construction.primitive);
        this.tagNumber = (bytes[cursor] & 0b00011111);
        cursor++;
        if (this.tagNumber >= 31) {
            /* NOTE:
                Section 8.1.2.4.2, point C of the International
                Telecommunications Union's X.690 specification says:
                "bits 7 to 1 of the first subsequent octet shall not all be zero."
                in reference to the bytes used to encode the tag number in long
                form, which happens when the least significant five bits of the
                first byte are all set.
                This essentially means that the long-form tag number must be
                encoded on the fewest possible octets. If the first byte is
                0b10000000, then it is not encoded on the fewest possible octets.
            */
            if (bytes[cursor] === 0b10000000) {
                throw new errors.ASN1PaddingError("Leading padding byte on long tag number encoding.");
            }
            this.tagNumber = 0;
            // This loop looks for the end of the encoded tag number.
            const limit: number = (((bytes.length - 1) >= 4) ? 4 : (bytes.length - 1));
            while (cursor < limit) {
                if (!(bytes[cursor++] & 0b10000000)) break;
            }
            if (bytes[cursor-1] & 0b10000000) {
                if (limit === (bytes.length - 1)) {
                    throw new errors.ASN1TruncationError("ASN.1 tag number appears to have been truncated.");
                } else {
                    throw new errors.ASN1OverflowError("ASN.1 tag number too large.");
                }
            }
            for (let i: number = 1; i < cursor; i++) {
                this.tagNumber <<= 7;
                this.tagNumber |= (bytes[i] & 0x7F);
            }
            if (this.tagNumber <= 31) {
                throw new errors.ASN1Error("ASN.1 tag number could have been encoded in short form.");
            }
        }

        // Length
        if ((bytes[cursor] & 0b10000000) === 0b10000000) {
            const numberOfLengthOctets: number = (bytes[cursor] & 0x7F);
            if (numberOfLengthOctets) { // Definite Long or Reserved
                if (numberOfLengthOctets === 0b01111111) { // Reserved
                    throw new errors.ASN1UndefinedError("Length byte with undefined meaning encountered.");
                }
                // Definite Long, if it has made it this far
                if (numberOfLengthOctets > 4) {
                    throw new errors.ASN1OverflowError("Element length too long to decode to an integer.");
                }
                if (cursor + numberOfLengthOctets >= bytes.length) {
                    throw new errors.ASN1TruncationError("Element length bytes appear to have been truncated.");
                }
                cursor++;
                const lengthNumberOctets: Uint8Array = new Uint8Array(4);
                for (let i: number = numberOfLengthOctets; i > 0; i--) {
                    lengthNumberOctets[(4 - i)] = bytes[(cursor + numberOfLengthOctets - i)];
                }
                let length: number = 0;
                lengthNumberOctets.forEach((octet) => {
                    length <<= 8;
                    length += octet;
                });
                if ((cursor + length) < cursor) { // This catches an overflow.
                    throw new errors.ASN1OverflowError("ASN.1 element too large.");
                }
                cursor += (numberOfLengthOctets);
                if ((cursor + length) > bytes.length) throw new errors.ASN1TruncationError("ASN.1 element truncated.");
                this.value = bytes.slice(cursor, (cursor + length));
                return (cursor + length);
            } else { // Indefinite
                if (this.construction !== ASN1Construction.constructed) {
                    throw new errors.ASN1ConstructionError(
                        "Indefinite length ASN.1 element was not of constructed construction.",
                    );
                }
                const startOfValue: number = ++cursor;
                let sentinel: number = cursor; // Used to track the length of the nested elements.
                while (sentinel < bytes.length) {
                    const child: BERElement = new BERElement();
                    child.recursionCount = (this.recursionCount + 1);
                    sentinel += child.fromBytes(bytes.slice(sentinel));
                    if (
                        child.tagClass === ASN1TagClass.universal
                        && child.construction === ASN1Construction.primitive
                        && child.tagNumber === ASN1UniversalType.endOfContent
                        && child.value.length === 0
                    ) break;
                }
                if (sentinel === bytes.length && (bytes[sentinel - 1] !== 0x00 || bytes[sentinel - 2] !== 0x00)) {
                    throw new errors.ASN1TruncationError(
                        "No END OF CONTENT element found at the end of indefinite length ASN.1 element.",
                    );
                }
                this.value = bytes.slice(startOfValue, (sentinel - 2));
                return sentinel;
            }
        } else { // Definite Short
            const length: number = (bytes[cursor++] & 0x7F);
            if ((cursor + length) > bytes.length) throw new errors.ASN1TruncationError("ASN.1 element was truncated.");
            this.value = bytes.slice(cursor, (cursor + length));
            return (cursor + length);
        }
    }

    public toBytes (): Uint8Array {
        let tagBytes: number[] = [ 0x00 ];
        tagBytes[0] |= (this.tagClass << 6);
        tagBytes[0] |= (this.construction << 5);
        if (this.tagNumber < 31) {
            tagBytes[0] |= this.tagNumber;
        } else {
            /*
                Per section 8.1.2.4 of X.690:
                The last five bits of the first byte being set indicate that
                the tag number is encoded in base-128 on the subsequent octets,
                using the first bit of each subsequent octet to indicate if the
                encoding continues on the next octet, just like how the
                individual numbers of OBJECT IDENTIFIER and RELATIVE OBJECT
                IDENTIFIER are encoded.
            */
            tagBytes[0] |= 0b00011111;
            let number: number = this.tagNumber; // We do not want to modify by reference.
            const encodedNumber: number[] = [];
            while (number !== 0) {
                encodedNumber.unshift(number & 0x7F);
                number >>>= 7;
                encodedNumber[0] |= 0b10000000;
            }
            encodedNumber[encodedNumber.length - 1] &= 0b01111111;
            tagBytes = tagBytes.concat(encodedNumber);
        }

        let lengthOctets: number[] = [ 0x00 ];
        switch (BERElement.lengthEncodingPreference) {
        case (LengthEncodingPreference.definite): {
            if (this.value.length < 127) {
                lengthOctets = [ this.value.length ];
            } else {
                const length: number = this.value.length;
                lengthOctets = [ 0, 0, 0, 0 ];
                for (let i: number = 0; i < 4; i++) {
                    lengthOctets[i] = ((length >>> ((3 - i) << 3)) & 0xFF);
                }
                let startOfNonPadding: number = 0;
                for (let i: number = 0; i < (lengthOctets.length - 1); i++) {
                    if (lengthOctets[i] === 0x00) startOfNonPadding++;
                }
                lengthOctets = lengthOctets.slice(startOfNonPadding);
                lengthOctets.unshift(0b10000000 | lengthOctets.length);
            }
            break;
        }
        case (LengthEncodingPreference.indefinite): {
            lengthOctets = [ 0b10000000 ];
            break;
        }
        default:
            throw new errors.ASN1UndefinedError("Invalid LengthEncodingPreference encountered!");
        }

        const ret: Uint8Array = new Uint8Array(
            tagBytes.length
            + lengthOctets.length
            + this.value.length
            + (BERElement.lengthEncodingPreference === LengthEncodingPreference.indefinite ? 2 : 0)
        );
        ret.set(tagBytes, 0);
        ret.set(lengthOctets, tagBytes.length);
        ret.set(this.value, (tagBytes.length + lengthOctets.length));
        return ret;
    }

    private deconstruct (dataType: string): Uint8Array {
        if (this.construction === ASN1Construction.primitive) {
            return new Uint8Array(this.value); // Clones it.
        } else {
            if ((this.recursionCount + 1) > BERElement.nestingRecursionLimit) throw new errors.ASN1RecursionError();
            let appendy: Uint8Array[] = [];
            const substrings: BERElement[] = this.sequence;
            substrings.forEach((substring) => {
                if (substring.tagClass !== this.tagClass) {
                    throw new errors.ASN1ConstructionError(`Invalid tag class in recursively-encoded ${dataType}.`);
                }
                if (substring.tagNumber !== this.tagNumber) {
                    throw new errors.ASN1ConstructionError(`Invalid tag class in recursively-encoded ${dataType}.`);
                }
                substring.recursionCount = (this.recursionCount + 1);
                appendy = appendy.concat(substring.deconstruct(dataType));
            });
            let totalLength: number = 0;
            appendy.forEach((substring) => {
                totalLength += substring.length;
            });
            const whole = new Uint8Array(totalLength);
            let currentIndex: number = 0;
            appendy.forEach((substring) => {
                whole.set(substring, currentIndex);
                currentIndex += substring.length;
            });
            return whole;
        }
    }
}
