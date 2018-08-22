// let BERElement = asn1.BERElement;
// let ObjectIdentifier = asn1.ObjectIdentifier;

// NOTE: Conveniently remove the trailing u from unsigned bytes with
// 0x([0-9A-F]{2})u --> 0x$1

describe("Basic Encoding Rules", function() {

    it("encodes and decodes a constructed BIT STRING correctly", function () {

        let data = [
            0x23, 0x0E,
                0x03, 0x02, 0x00, 0x0F,
                0x23, 0x04,
                    0x03, 0x02, 0x00, 0x0F,
                0x03, 0x02, 0x05, 0xF0
        ];

        let element = new BERElement();
        element.fromBytes(data);
        expect(element.bitString).toEqual([
            false, false, false, false, true, true, true, true,
            false, false, false, false, true, true, true, true,
            true, true, true
        ]);

    });

    it("encodes and decodes a constructed OCTET STRING correctly", function () {
        let data = new Uint8Array([
            0x24, 0x11,
                0x04, 0x04, 0x01, 0x02, 0x03, 0x04,
                0x24, 0x05,
                    0x04, 0x03, 0x05, 0x06, 0x07,
                0x04, 0x02, 0x08, 0x09
        ]);

        let element = new BERElement();
        element.fromBytes(data);
        expect(element.octetString).toEqual(new Uint8Array([
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09
        ]));

    });

    it("encodes and decodes a constructed ObjectDescriptor correctly", function () {
        let data = new Uint8Array([
            0x27, 0x12,
                0x07, 0x04, 0x53, 0x68, 0x69, 0x61, // S h i a
                0x27, 0x04,
                    0x07, 0x02, 0x4C, 0x61, // L a
                0x07, 0x04, 0x42, 0x54, 0x46, 0x4F // B T F O
        ]);

        let element = new BERElement();
        element.fromBytes(data);
        expect(element.objectDescriptor).toBe("ShiaLaBTFO");
    });

    it("encodes and decodes a constructed NumericString correctly", function () {
        let data = new Uint8Array([
            0x32, 0x12,
                0x12, 0x04, 0x30, 0x31, 0x32, 0x33, // 0 1 2 3
                0x32, 0x04,
                    0x12, 0x02, 0x34, 0x35, // 4 5
                0x12, 0x04, 0x36, 0x37, 0x38, 0x39 // 6 7 8 9
        ]);

        let element = new BERElement();
        element.fromBytes(data);
        expect(element.numericString).toBe("0123456789");
    });

    it("encodes and decodes a constructed PrintableString correctly", function () {
        let data = new Uint8Array([
            0x33, 0x12,
                0x13, 0x04, 0x30, 0x31, 0x32, 0x33, // 0 1 2 3
                0x33, 0x04,
                    0x13, 0x02, 0x34, 0x35, // 4 5
                0x13, 0x04, 0x36, 0x37, 0x38, 0x39 // 6 7 8 9
        ]);

        let element = new BERElement();
        element.fromBytes(data);
        expect(element.printableString).toBe("0123456789");
    });

});