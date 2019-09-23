import { ObjectIdentifier as OID } from "./types/objectidentifier";
import { ASN1Construction, ASN1TagClass } from "./values";
export declare abstract class ASN1Element {
    protected recursionCount: number;
    protected static readonly nestingRecursionLimit: number;
    tagClass: ASN1TagClass;
    construction: ASN1Construction;
    tagNumber: number;
    value: Uint8Array;
    readonly length: number;
    abstract boolean: boolean;
    abstract integer: number;
    abstract bitString: boolean[];
    abstract octetString: Uint8Array;
    abstract objectIdentifier: OID;
    abstract objectDescriptor: string;
    abstract real: number;
    abstract enumerated: number;
    abstract utf8String: string;
    abstract relativeObjectIdentifier: number[];
    abstract sequence: ASN1Element[];
    abstract set: ASN1Element[];
    abstract numericString: string;
    abstract printableString: string;
    abstract teletexString: Uint8Array;
    abstract videotexString: Uint8Array;
    abstract ia5String: string;
    abstract utcTime: Date;
    abstract generalizedTime: Date;
    abstract graphicString: string;
    abstract visibleString: string;
    abstract generalString: string;
    abstract universalString: string;
    abstract bmpString: string;
    protected static validateDateTime(dataType: string, year: number, month: number, date: number, hours: number, minutes: number, seconds: number): void;
    protected static decodeUnsignedBigEndianInteger(value: Uint8Array): number;
    protected static decodeSignedBigEndianInteger(value: Uint8Array): number;
}
//# sourceMappingURL=asn1.d.ts.map