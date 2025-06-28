import React, { useEffect, useState } from "react";
import friends from "../../images/Friendtab.svg";
import Nitro from "../../images/Nitro.svg";
import Message from "../../images/Messages.svg";
import Shop from "../../images/Shop.svg";
import styled from "styled-components";
import { toast, Toaster } from "sonner";
import { useSelector, useDispatch } from "react-redux";
import { setFriendTabFlag, settogglesidebar } from "@/Redux/sessionSlice";

const Buttonsection = () => {
  const dispatch = useDispatch();
  const { FriendTabFlag } = useSelector((state) => state.counterSlice);
  const [currentWidth, setCurrentwidth] = useState(window.innerWidth);
  useEffect(() => {
    setCurrentwidth(window.innerWidth);
  }, [currentWidth, window.innerWidth]);
  const handleFriendClick = () => {
    if (currentWidth < 1024) {
      dispatch(setFriendTabFlag(true));
      dispatch(settogglesidebar(false));
      return;
    }
  };
  return (
    <Cover>
      <Div onClick={handleFriendClick}>
        <img src={friends} alt="" />
        <p>Friends</p>
      </Div>
      <Div
        onClick={() =>
          toast.success("Comming Soon, Stay Tuned!", {
            position: "top-right",
            style: {
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              border: "none",
              filter: "drop-shadow(0px 0px 3px #151617)",
              dropshadow: "1px 1px 1px rgba(0, 0, 0, 0.5)",
              backgroundImage:
                "radial-gradient( circle 100px at -1.4% 14%,  #66ffad4b 0%, #27292c 90% )",
            },

            duration: 2000,
          })
        }
      >
        <img src={Nitro} alt="" />
        <p>Nitro</p>
      </Div>
      <Div
        onClick={() =>
          toast.success("Comming Soon, Stay Tuned!", {
            style: {
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              border: "none",
              filter: "drop-shadow(0px 0px 3px #151617)",
              dropshadow: "1px 1px 1px rgba(0, 0, 0, 0.5)",
              backgroundImage:
                "radial-gradient( circle 100px at -1.4% 14%,  #66ffad4b 0%, #27292c 90% )",
            },
            position: "top-right",
            duration: 1000,
          })
        }
      >
        <img src={Message} alt="" />
        <p>Message Request</p>
      </Div>
      <Div
        onClick={() =>
          toast.success("Comming Soon, Stay Tuned!", {
            style: {
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              border: "none",
              filter: "drop-shadow(0px 0px 3px #151617)",
              dropshadow: "1px 1px 1px rgba(0, 0, 0, 0.5)",
              backgroundImage:
                "radial-gradient( circle 100px at -1.4% 14%,  #66ffad4b 0%, #27292c 90% )",
            },
            position: "top-right",
            duration: 1000,
          })
        }
      >
        <img src={Shop} alt="" />
        <p>Shop</p>
      </Div>
    </Cover>
  );
};

export default Buttonsection;

const Cover = styled.div`
  margin-top: 0.5rem;
  width: 100%;
  height: 13rem;
  background-color: #2b2d31;
  display: flex;
  align-items: start;
  flex-direction: column;
  gap: 0.2rem;
  @media (max-width: 1024px) {
    margin-left: 0.5rem;
  }
`;
const Div = styled.div`
  width: 93%;
  height: 2.6rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  border-radius: 0.2rem;
  &:hover {
    background-color: #313338;
  }
  img {
    margin-left: 0.8rem;
    width: 1.5rem;
  }
  p {
    font-size: 1rem;
    color: #949ba4;
    font-weight: medium;
  }
  .custom-toast {
    background-image: radial-gradient(
      circle farthest-corner at -4% -12.9%,
      rgba(74, 98, 110, 1) 0.3%,
      rgba(30, 33, 48, 1) 90.2%
    );
  }
`;
