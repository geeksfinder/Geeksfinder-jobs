import { describe, expect, it } from "vitest";
import { decodeEntities, plainText, stripTags } from "@/lib/html-text";
import { htmlToText } from "@/lib/jobtext";

describe("stripTags", () => {
  it("leaves no tag behind, even from nested tricks", () => {
    expect(stripTags("<scr<script>ipt>alert(1)</script>")).not.toMatch(/<|>/);
    expect(stripTags("a<<b>>c")).not.toMatch(/<|>/);
    expect(stripTags("<<script>script>x<</script>/script>")).not.toMatch(/script>|<script/i);
  });
  it("removes script and style blocks whatever their closing tag looks like", () => {
    expect(plainText("Hi<script>evil()</script >there")).toBe("Hi there");
    expect(plainText("Hi<SCRIPT type=x>evil()</SCRIPT foo>there")).toBe("Hi there");
    expect(plainText("Hi<style>p{}</style\n>there")).toBe("Hi there");
  });
});

describe("decodeEntities", () => {
  it("decodes each entity exactly once", () => {
    expect(decodeEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(decodeEntities("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
  });
  it("handles numeric entities and leaves unknown ones alone", () => {
    expect(decodeEntities("it&#39;s &#x2014; done &unknown;")).toBe("it's — done &unknown;");
  });
});

describe("plain text from HTML", () => {
  it("never turns encoded text back into a tag", () => {
    expect(plainText("&lt;script&gt;alert(1)&lt;/script&gt; Apply now")).not.toMatch(/<|>/);
  });
  it("keeps job description structure (Greenhouse sends entity-encoded HTML)", () => {
    const encoded = "&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React&lt;/li&gt;&lt;li&gt;Git&lt;/li&gt;&lt;/ul&gt;";
    // Blank lines between list items are normal here; formatJobDescription groups them into one list
    expect(htmlToText(encoded, { encoded: true }).replace(/\n+/g, "\n")).toBe("Build & ship\n• React\n• Git");
  });
});
