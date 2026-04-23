import java.net.http.*;
import java.net.*;
public class TestHttp {
    public static void main(String[] args) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost"))
            .header("Authorization", "Bearer test")
            .build();
        System.out.println("Success! " + req.headers().map());
    }
}
