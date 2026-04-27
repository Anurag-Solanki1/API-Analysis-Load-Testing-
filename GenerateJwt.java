import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;
import javax.crypto.Mac;
import java.nio.charset.StandardCharsets;

public class GenerateJwt {
    public static void main(String[] args) throws Exception {
        String email = args.length > 0 ? args[0] : "steakrol4@gmail.com";
        String secret = "YourSuperSecretKeyForJWTTokenSigning_PleaseChangeInProduction_MinLength256Bits!!";
        String header = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
        String payload = "{\"sub\":\"" + email + "\",\"exp\":1800000000}";
        
        String b64Header = Base64.getUrlEncoder().withoutPadding().encodeToString(header.getBytes(StandardCharsets.UTF_8));
        String b64Payload = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        
        String data = b64Header + "." + b64Payload;
        
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] sig = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        
        String b64Sig = Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
        
        System.out.println(data + "." + b64Sig);
    }
}
